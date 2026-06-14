import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

async function getActor(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("school_id, full_name, email").eq("id", userId).maybeSingle();
  const { data: rolesRows } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  const roles = (rolesRows ?? []).map((r) => r.role as string);
  const [{ data: teacher }, { data: parent }] = await Promise.all([
    supabaseAdmin.from("teachers").select("id, school_id").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("parents").select("id, school_id").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    userId,
    schoolId: profile?.school_id ?? teacher?.school_id ?? parent?.school_id ?? null,
    fullName: profile?.full_name ?? profile?.email ?? null,
    isAdmin: roles.includes("admin"),
    isTeacher: roles.includes("teacher"),
    isParent: roles.includes("parent"),
    teacherId: teacher?.id ?? null,
    parentId: parent?.id ?? null,
  };
}

async function getConvWithAccess(userId: string, conversationId: string) {
  const actor = await getActor(userId);
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id, school_id, teacher_id, parent_id, student_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) throw new Error("Conversation not found");
  const isParticipant =
    (actor.teacherId && conv.teacher_id === actor.teacherId) ||
    (actor.parentId && conv.parent_id === actor.parentId);
  if (!isParticipant) throw new Error("Forbidden");
  return { actor, conv };
}

// ---------- List conversations ----------
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    let query = supabaseAdmin
      .from("conversations")
      .select("id, teacher_id, parent_id, student_id, last_message_at, last_message_preview, created_at")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (actor.teacherId) query = query.eq("teacher_id", actor.teacherId);
    else if (actor.parentId) query = query.eq("parent_id", actor.parentId);
    else return { conversations: [] };

    const { data: convs } = await query;
    if (!convs || convs.length === 0) return { conversations: [] };

    const teacherIds = Array.from(new Set(convs.map((c) => c.teacher_id)));
    const parentIds = Array.from(new Set(convs.map((c) => c.parent_id)));
    const studentIds = Array.from(new Set(convs.map((c) => c.student_id).filter(Boolean) as string[]));

    const [{ data: teachers }, { data: parents }, { data: students }] = await Promise.all([
      supabaseAdmin.from("teachers").select("id, full_name, user_id").in("id", teacherIds),
      supabaseAdmin.from("parents").select("id, full_name, user_id").in("id", parentIds),
      studentIds.length
        ? supabaseAdmin.from("students").select("id, full_name").in("id", studentIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ]);

    const tMap = new Map((teachers ?? []).map((t) => [t.id, t]));
    const pMap = new Map((parents ?? []).map((p) => [p.id, p]));
    const sMap = new Map((students ?? []).map((s) => [s.id, s]));

    // unread counts: messages in conv not authored by me and not in my message_reads
    const convIds = convs.map((c) => c.id);
    const [{ data: msgs }, { data: reads }] = await Promise.all([
      supabaseAdmin.from("messages").select("id, conversation_id, sender_user_id").in("conversation_id", convIds),
      supabaseAdmin.from("message_reads").select("message_id").eq("user_id", context.userId),
    ]);
    const myReads = new Set((reads ?? []).map((r) => r.message_id));
    const unreadByConv = new Map<string, number>();
    (msgs ?? []).forEach((m) => {
      if (m.sender_user_id !== context.userId && !myReads.has(m.id)) {
        unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
      }
    });

    const result = convs.map((c) => {
      const t = tMap.get(c.teacher_id);
      const p = pMap.get(c.parent_id);
      const s = c.student_id ? sMap.get(c.student_id) : null;
      const otherIsTeacher = actor.parentId != null;
      return {
        id: c.id,
        teacher: t ? { id: t.id, fullName: t.full_name, userId: t.user_id } : null,
        parent: p ? { id: p.id, fullName: p.full_name, userId: p.user_id } : null,
        student: s ? { id: s.id, fullName: s.full_name } : null,
        lastMessageAt: c.last_message_at,
        lastMessagePreview: c.last_message_preview,
        otherName: otherIsTeacher ? (t?.full_name ?? "Teacher") : (p?.full_name ?? "Parent"),
        otherRole: otherIsTeacher ? "teacher" : "parent",
        unreadCount: unreadByConv.get(c.id) ?? 0,
      };
    });
    return { conversations: result, actor: { isTeacher: actor.isTeacher, isParent: actor.isParent, userId: actor.userId } };
  });

// ---------- Get or create conversation ----------
export const getOrCreateConversation = createServerFn({ method: "POST" })
  .inputValidator((d: { teacherUserId?: string; parentUserId?: string; studentId?: string | null }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) throw new Error("No school context");

    let teacherRow: { id: string; school_id: string } | null = null;
    let parentRow: { id: string; school_id: string } | null = null;

    if (actor.teacherId) {
      teacherRow = { id: actor.teacherId, school_id: actor.schoolId };
      if (!data.parentUserId) throw new Error("parentUserId required");
      const { data: p } = await supabaseAdmin
        .from("parents").select("id, school_id").eq("user_id", data.parentUserId).maybeSingle();
      if (!p) throw new Error("Parent not found");
      parentRow = p;
    } else if (actor.parentId) {
      parentRow = { id: actor.parentId, school_id: actor.schoolId };
      if (!data.teacherUserId) throw new Error("teacherUserId required");
      const { data: t } = await supabaseAdmin
        .from("teachers").select("id, school_id").eq("user_id", data.teacherUserId).maybeSingle();
      if (!t) throw new Error("Teacher not found");
      teacherRow = t;
    } else {
      throw new Error("Only teachers and parents can start conversations");
    }

    // Validate relationship: teacher must teach a section that has one of this parent's students
    const { data: parentStudents } = await supabaseAdmin
      .from("parent_students").select("student_id").eq("parent_id", parentRow.id);
    const childIds = (parentStudents ?? []).map((r) => r.student_id);
    if (childIds.length === 0) throw new Error("No children linked");
    const { data: childRows } = await supabaseAdmin
      .from("students").select("id, section_id, class_id").in("id", childIds);
    const sectionIds = (childRows ?? []).map((s) => s.section_id).filter(Boolean) as string[];
    const classIds = (childRows ?? []).map((s) => s.class_id).filter(Boolean) as string[];
    const [{ data: st }, { data: ct }, { data: tc }] = await Promise.all([
      sectionIds.length
        ? supabaseAdmin.from("section_teachers").select("section_id").eq("teacher_id", teacherRow.id).in("section_id", sectionIds)
        : Promise.resolve({ data: [] as { section_id: string }[] }),
      sectionIds.length
        ? supabaseAdmin.from("class_teachers").select("section_id").eq("teacher_id", teacherRow.id).in("section_id", sectionIds)
        : Promise.resolve({ data: [] as { section_id: string }[] }),
      classIds.length
        ? supabaseAdmin.from("teacher_classes").select("class_id").eq("teacher_id", teacherRow.id).in("class_id", classIds)
        : Promise.resolve({ data: [] as { class_id: string }[] }),
    ]);
    if ((st?.length ?? 0) + (ct?.length ?? 0) + (tc?.length ?? 0) === 0) {
      throw new Error("Not authorized to message this user");
    }

    const studentId = data.studentId ?? null;

    // Try find existing
    let q = supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("teacher_id", teacherRow.id)
      .eq("parent_id", parentRow.id);
    q = studentId ? q.eq("student_id", studentId) : q.is("student_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing) return { id: existing.id };

    const { data: inserted, error } = await supabaseAdmin
      .from("conversations")
      .insert({
        school_id: teacherRow.school_id,
        teacher_id: teacherRow.id,
        parent_id: parentRow.id,
        student_id: studentId,
      })
      .select("id").single();
    if (error) throw error;
    return { id: inserted.id };
  });

// ---------- List eligible recipients ----------
export const listEligibleRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (actor.teacherId) {
      // Find sections this teacher teaches
      const [{ data: st }, { data: ct }, { data: tc }] = await Promise.all([
        supabaseAdmin.from("section_teachers").select("section_id").eq("teacher_id", actor.teacherId),
        supabaseAdmin.from("class_teachers").select("section_id, class_id").eq("teacher_id", actor.teacherId),
        supabaseAdmin.from("teacher_classes").select("class_id").eq("teacher_id", actor.teacherId),
      ]);
      const sectionIds = new Set<string>();
      (st ?? []).forEach((r) => r.section_id && sectionIds.add(r.section_id));
      (ct ?? []).forEach((r) => r.section_id && sectionIds.add(r.section_id));
      const classIds = new Set<string>();
      (ct ?? []).forEach((r) => r.class_id && classIds.add(r.class_id));
      (tc ?? []).forEach((r) => r.class_id && classIds.add(r.class_id));
      // students in these sections/classes
      let students: { id: string; full_name: string; section_id: string | null; class_id: string | null }[] = [];
      if (sectionIds.size) {
        const { data } = await supabaseAdmin.from("students").select("id, full_name, section_id, class_id").in("section_id", Array.from(sectionIds));
        students = students.concat(data ?? []);
      }
      if (classIds.size) {
        const { data } = await supabaseAdmin.from("students").select("id, full_name, section_id, class_id").in("class_id", Array.from(classIds));
        students = students.concat(data ?? []);
      }
      const dedup = new Map(students.map((s) => [s.id, s]));
      students = Array.from(dedup.values());
      if (students.length === 0) return { recipients: [] };
      const { data: ps } = await supabaseAdmin
        .from("parent_students").select("parent_id, student_id").in("student_id", students.map((s) => s.id));
      const parentIds = Array.from(new Set((ps ?? []).map((r) => r.parent_id)));
      if (parentIds.length === 0) return { recipients: [] };
      const { data: parents } = await supabaseAdmin
        .from("parents").select("id, full_name, user_id").in("id", parentIds);
      const sMap = new Map(students.map((s) => [s.id, s]));
      const out = (parents ?? []).filter((p) => p.user_id).map((p) => {
        const links = (ps ?? []).filter((r) => r.parent_id === p.id);
        const kids = links.map((r) => sMap.get(r.student_id)).filter(Boolean) as { id: string; full_name: string }[];
        return { userId: p.user_id as string, fullName: p.full_name, role: "parent" as const, students: kids };
      });
      return { recipients: out };
    }
    if (actor.parentId) {
      const { data: ps } = await supabaseAdmin.from("parent_students").select("student_id").eq("parent_id", actor.parentId);
      const studentIds = (ps ?? []).map((r) => r.student_id);
      if (studentIds.length === 0) return { recipients: [] };
      const { data: students } = await supabaseAdmin
        .from("students").select("id, full_name, section_id, class_id").in("id", studentIds);
      const sectionIds = new Set<string>();
      const classIds = new Set<string>();
      (students ?? []).forEach((s) => { if (s.section_id) sectionIds.add(s.section_id); if (s.class_id) classIds.add(s.class_id); });
      const teacherIds = new Set<string>();
      if (sectionIds.size) {
        const [{ data: st }, { data: ct }] = await Promise.all([
          supabaseAdmin.from("section_teachers").select("teacher_id").in("section_id", Array.from(sectionIds)),
          supabaseAdmin.from("class_teachers").select("teacher_id").in("section_id", Array.from(sectionIds)),
        ]);
        (st ?? []).forEach((r) => teacherIds.add(r.teacher_id));
        (ct ?? []).forEach((r) => teacherIds.add(r.teacher_id));
      }
      if (classIds.size) {
        const { data: tc } = await supabaseAdmin.from("teacher_classes").select("teacher_id").in("class_id", Array.from(classIds));
        (tc ?? []).forEach((r) => teacherIds.add(r.teacher_id));
      }
      if (teacherIds.size === 0) return { recipients: [] };
      const { data: teachers } = await supabaseAdmin
        .from("teachers").select("id, full_name, user_id").in("id", Array.from(teacherIds));
      const out = (teachers ?? []).filter((t) => t.user_id).map((t) => ({
        userId: t.user_id as string,
        fullName: t.full_name,
        role: "teacher" as const,
        students: students ?? [],
      }));
      return { recipients: out };
    }
    return { recipients: [] };
  });

// ---------- List messages ----------
export const listMessages = createServerFn({ method: "GET" })
  .inputValidator((d: { conversationId: string }) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { conv } = await getConvWithAccess(context.userId, data.conversationId);
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("id, conversation_id, sender_user_id, sender_role, body, delivered_at, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(500);
    const msgIds = (msgs ?? []).map((m) => m.id);
    const [{ data: atts }, { data: reads }] = await Promise.all([
      msgIds.length
        ? supabaseAdmin.from("message_attachments").select("id, message_id, file_name, file_path, mime_type, size").in("message_id", msgIds)
        : Promise.resolve({ data: [] as { id: string; message_id: string; file_name: string; file_path: string; mime_type: string; size: number }[] }),
      msgIds.length
        ? supabaseAdmin.from("message_reads").select("message_id, user_id, read_at").in("message_id", msgIds)
        : Promise.resolve({ data: [] as { message_id: string; user_id: string; read_at: string }[] }),
    ]);

    // signed URLs for attachments
    const enriched = await Promise.all(
      (atts ?? []).map(async (a) => {
        const { data: signed } = await supabaseAdmin.storage.from("chat-attachments").createSignedUrl(a.file_path, 60 * 60);
        return { ...a, url: signed?.signedUrl ?? null };
      }),
    );
    const attByMsg = new Map<string, typeof enriched>();
    enriched.forEach((a) => {
      const arr = attByMsg.get(a.message_id) ?? [];
      arr.push(a);
      attByMsg.set(a.message_id, arr);
    });
    const readsByMsg = new Map<string, { user_id: string; read_at: string }[]>();
    (reads ?? []).forEach((r) => {
      const arr = readsByMsg.get(r.message_id) ?? [];
      arr.push({ user_id: r.user_id, read_at: r.read_at });
      readsByMsg.set(r.message_id, arr);
    });

    const out = (msgs ?? []).map((m) => ({
      ...m,
      attachments: attByMsg.get(m.id) ?? [],
      reads: readsByMsg.get(m.id) ?? [],
    }));
    // metadata about other participant
    const [{ data: t }, { data: p }, { data: s }] = await Promise.all([
      supabaseAdmin.from("teachers").select("id, full_name, user_id").eq("id", conv.teacher_id).maybeSingle(),
      supabaseAdmin.from("parents").select("id, full_name, user_id").eq("id", conv.parent_id).maybeSingle(),
      conv.student_id
        ? supabaseAdmin.from("students").select("id, full_name").eq("id", conv.student_id).maybeSingle()
        : Promise.resolve({ data: null as { id: string; full_name: string } | null }),
    ]);
    return {
      messages: out,
      conversation: {
        id: conv.id,
        teacher: t,
        parent: p,
        student: s,
      },
      meUserId: context.userId,
    };
  });

// ---------- Send message ----------
const sendInput = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().max(4000).optional().nullable(),
  attachments: z.array(z.object({
    filePath: z.string().min(1).max(500),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(120),
    size: z.number().int().min(0).max(MAX_BYTES),
  })).max(10).optional(),
});

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((d: z.input<typeof sendInput>) => sendInput.parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { actor, conv } = await getConvWithAccess(context.userId, data.conversationId);
    const trimmed = (data.body ?? "").trim();
    const attachments = data.attachments ?? [];
    if (!trimmed && attachments.length === 0) throw new Error("Empty message");

    for (const a of attachments) {
      if (!ALLOWED_MIMES.has(a.mimeType)) throw new Error(`Unsupported file type: ${a.mimeType}`);
      if (a.size > MAX_BYTES) throw new Error(`File too large: ${a.fileName}`);
      if (!a.filePath.startsWith(`${conv.id}/`)) throw new Error("Invalid attachment path");
    }

    const senderRole = actor.teacherId && conv.teacher_id === actor.teacherId ? "teacher" : "parent";

    const { data: msg, error } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: conv.id,
        sender_user_id: context.userId,
        sender_role: senderRole,
        body: trimmed || null,
      })
      .select("id, created_at")
      .single();
    if (error) throw error;

    if (attachments.length) {
      const rows = attachments.map((a) => ({
        message_id: msg.id,
        file_name: a.fileName,
        file_path: a.filePath,
        mime_type: a.mimeType,
        size: a.size,
      }));
      const { error: attErr } = await supabaseAdmin.from("message_attachments").insert(rows);
      if (attErr) throw attErr;
    }

    const preview = trimmed
      ? trimmed.slice(0, 140)
      : attachments.length === 1
        ? `📎 ${attachments[0].fileName}`
        : `📎 ${attachments.length} attachments`;

    await supabaseAdmin
      .from("conversations")
      .update({ last_message_at: msg.created_at, last_message_preview: preview })
      .eq("id", conv.id);

    // Notify the other participant
    try {
      const otherTable = senderRole === "teacher" ? "parents" : "teachers";
      const otherId = senderRole === "teacher" ? conv.parent_id : conv.teacher_id;
      const { data: other } = await supabaseAdmin
        .from(otherTable).select("user_id").eq("id", otherId).maybeSingle();
      if (other?.user_id) {
        await supabaseAdmin.from("notifications").insert({
          user_id: other.user_id,
          school_id: conv.school_id,
          type: "chat_message",
          title: `New message from ${actor.fullName ?? (senderRole === "teacher" ? "Teacher" : "Parent")}`,
          body: preview,
          student_id: conv.student_id,
          metadata: { conversation_id: conv.id, message_id: msg.id, sender_role: senderRole },
        });
      }
    } catch (e) {
      console.error("notify chat failed", e);
    }

    return { id: msg.id };
  });


// ---------- Mark conversation read ----------
export const markConversationRead = createServerFn({ method: "POST" })
  .inputValidator((d: { conversationId: string }) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { conv } = await getConvWithAccess(context.userId, data.conversationId);
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("id, sender_user_id")
      .eq("conversation_id", conv.id);
    const unread = (msgs ?? []).filter((m) => m.sender_user_id !== context.userId);
    if (unread.length === 0) return { ok: true, marked: 0 };
    const { data: existing } = await supabaseAdmin
      .from("message_reads")
      .select("message_id")
      .eq("user_id", context.userId)
      .in("message_id", unread.map((m) => m.id));
    const have = new Set((existing ?? []).map((r) => r.message_id));
    const toInsert = unread.filter((m) => !have.has(m.id)).map((m) => ({
      message_id: m.id,
      user_id: context.userId,
    }));
    if (toInsert.length) {
      await supabaseAdmin.from("message_reads").insert(toInsert);
    }
    return { ok: true, marked: toInsert.length };
  });
