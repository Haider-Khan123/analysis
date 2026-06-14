import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ATT_BUCKET = "announcement-attachments";

async function getActor(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("school_id, full_name").eq("id", userId).maybeSingle();
  const { data: rolesRows } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  const roles = (rolesRows ?? []).map((r) => r.role as string);
  return {
    schoolId: profile?.school_id ?? null,
    fullName: profile?.full_name ?? null,
    isAdmin: roles.includes("admin"),
    isTeacher: roles.includes("teacher"),
    isParent: roles.includes("parent"),
  };
}

async function getTeacherSectionIds(userId: string): Promise<{ sectionIds: string[]; classIds: string[] }> {
  const { data: t } = await supabaseAdmin.from("teachers").select("id").eq("user_id", userId).maybeSingle();
  if (!t) return { sectionIds: [], classIds: [] };
  const [{ data: ct }, { data: st }, { data: tc }] = await Promise.all([
    supabaseAdmin.from("class_teachers").select("section_id, class_id").eq("teacher_id", t.id),
    supabaseAdmin.from("section_teachers").select("section_id").eq("teacher_id", t.id),
    supabaseAdmin.from("teacher_classes").select("class_id").eq("teacher_id", t.id),
  ]);
  const sectionIds = new Set<string>();
  (st ?? []).forEach((r) => sectionIds.add(r.section_id));
  (ct ?? []).forEach((r) => sectionIds.add(r.section_id));
  const classIds = new Set<string>();
  (tc ?? []).forEach((r) => classIds.add(r.class_id));
  (ct ?? []).forEach((r) => classIds.add(r.class_id));
  if (classIds.size) {
    const { data: extra } = await supabaseAdmin.from("sections").select("id").in("class_id", Array.from(classIds));
    (extra ?? []).forEach((s) => sectionIds.add(s.id));
  }
  return { sectionIds: Array.from(sectionIds), classIds: Array.from(classIds) };
}

const CATEGORIES = [
  "school_closure","public_holiday","sports_day","parent_teacher_meeting","exam_schedule",
  "homework_reminder","class_test","field_trip","project_submission","other",
] as const;
const PRIORITIES = ["low","medium","high","urgent"] as const;
const TYPES = ["school_wide","class_specific"] as const;

const AttachmentInput = z.object({
  file_name: z.string().min(1).max(200),
  file_path: z.string().min(1).max(500),
  mime_type: z.string().max(120).optional().nullable(),
  size_bytes: z.number().int().nonnegative().optional().nullable(),
});

const CreateInput = z.object({
  type: z.enum(TYPES),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  classId: z.string().uuid().nullable().optional(),
  sectionId: z.string().uuid().nullable().optional(),
  publishAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  publishImmediately: z.boolean().default(false),
  attachments: z.array(AttachmentInput).max(10).optional().default([]),
});

export const getAnnouncementScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { classes: [], sections: [] };
    if (actor.isAdmin) {
      const [{ data: classes }, { data: sections }] = await Promise.all([
        supabaseAdmin.from("classes").select("id, name").eq("school_id", actor.schoolId).order("name"),
        supabaseAdmin.from("sections").select("id, name, class_id").eq("school_id", actor.schoolId).order("name"),
      ]);
      return { classes: classes ?? [], sections: sections ?? [] };
    }
    const { sectionIds, classIds } = await getTeacherSectionIds(context.userId);
    // Also include classes for any teacher-owned section
    const { data: secAll } = sectionIds.length
      ? await supabaseAdmin.from("sections").select("id, name, class_id").in("id", sectionIds).eq("school_id", actor.schoolId).order("name")
      : { data: [] as Array<{ id: string; name: string; class_id: string }> };
    const allClassIds = Array.from(new Set([...classIds, ...(secAll ?? []).map((s) => s.class_id)]));
    const { data: classes } = allClassIds.length
      ? await supabaseAdmin.from("classes").select("id, name").in("id", allClassIds).eq("school_id", actor.schoolId).order("name")
      : { data: [] as Array<{ id: string; name: string }> };
    return { classes: classes ?? [], sections: secAll ?? [] };
  });

async function notifyAudience(args: {
  announcementId: string;
  schoolId: string;
  type: "school_wide" | "class_specific";
  title: string;
  priority: string;
  classId: string | null;
  sectionId: string | null;
}) {
  const notifType = args.type === "school_wide" ? "announcement_school_wide" : "announcement_class";
  const body = `[${args.priority.toUpperCase()}] ${args.title}`;
  const userIds = new Set<string>();

  if (args.type === "school_wide") {
    // All teachers + all linked parents in school
    const { data: ts } = await supabaseAdmin.from("teachers").select("user_id").eq("school_id", args.schoolId);
    (ts ?? []).forEach((t) => t.user_id && userIds.add(t.user_id));
    const { data: ps } = await supabaseAdmin.from("parents").select("user_id").eq("school_id", args.schoolId);
    (ps ?? []).forEach((p) => p.user_id && userIds.add(p.user_id));
  } else {
    // Teachers assigned to this section/class + parents of students in this section/class
    let secIds: string[] = [];
    if (args.sectionId) secIds = [args.sectionId];
    else if (args.classId) {
      const { data: secs } = await supabaseAdmin.from("sections").select("id").eq("class_id", args.classId);
      secIds = (secs ?? []).map((s) => s.id);
    }
    if (secIds.length) {
      const [{ data: ct }, { data: st }] = await Promise.all([
        supabaseAdmin.from("class_teachers").select("teacher_id").in("section_id", secIds),
        supabaseAdmin.from("section_teachers").select("teacher_id").in("section_id", secIds),
      ]);
      const tIds = Array.from(new Set([...(ct ?? []), ...(st ?? [])].map((r) => r.teacher_id)));
      if (tIds.length) {
        const { data: tRows } = await supabaseAdmin.from("teachers").select("user_id").in("id", tIds);
        (tRows ?? []).forEach((t) => t.user_id && userIds.add(t.user_id));
      }
    }
    // Parents of students in section or (if no section) class
    let studentQ = supabaseAdmin.from("students").select("id").eq("school_id", args.schoolId);
    if (args.sectionId) studentQ = studentQ.eq("section_id", args.sectionId);
    else if (args.classId) studentQ = studentQ.eq("class_id", args.classId);
    const { data: students } = await studentQ;
    const sIds = (students ?? []).map((s) => s.id);
    if (sIds.length) {
      const { data: links } = await supabaseAdmin.from("parent_students").select("parent_id").in("student_id", sIds);
      const parentIds = Array.from(new Set((links ?? []).map((l) => l.parent_id)));
      if (parentIds.length) {
        const { data: parents } = await supabaseAdmin.from("parents").select("user_id").in("id", parentIds);
        (parents ?? []).forEach((p) => p.user_id && userIds.add(p.user_id));
      }
    }
  }

  if (!userIds.size) return;
  const rows = Array.from(userIds).map((uid) => ({
    user_id: uid,
    school_id: args.schoolId,
    type: notifType,
    title: args.type === "school_wide" ? "School-Wide Announcement" : "Class Announcement",
    body,
    metadata: { announcement_id: args.announcementId } as unknown as never,
  }));
  await supabaseAdmin.from("notifications").insert(rows);
}

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { ok: false as const, error: "No school." };
    if (!actor.isAdmin && !actor.isTeacher) return { ok: false as const, error: "Not allowed." };

    if (data.type === "class_specific") {
      if (!data.classId) return { ok: false as const, error: "Class required." };
      if (!actor.isAdmin && data.sectionId) {
        const { sectionIds } = await getTeacherSectionIds(context.userId);
        if (!sectionIds.includes(data.sectionId)) {
          return { ok: false as const, error: "Not assigned to this section." };
        }
      }
      if (!actor.isAdmin && !data.sectionId) {
        return { ok: false as const, error: "Teachers must select a section." };
      }
    }

    const publishNow = data.publishImmediately || (data.publishAt && new Date(data.publishAt) <= new Date());
    const status: "draft" | "scheduled" | "published" =
      publishNow ? "published" : data.publishAt ? "scheduled" : "draft";
    const publishAt = publishNow ? new Date().toISOString() : data.publishAt || null;

    const { data: row, error } = await supabaseAdmin.from("announcements").insert({
      school_id: actor.schoolId,
      type: data.type,
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status,
      publish_at: publishAt,
      expires_at: data.expiresAt || null,
      class_id: data.type === "class_specific" ? data.classId : null,
      section_id: data.type === "class_specific" ? (data.sectionId ?? null) : null,
      created_by: context.userId,
    }).select("id").single();
    if (error || !row) return { ok: false as const, error: error?.message ?? "Insert failed." };

    if (data.attachments.length) {
      await supabaseAdmin.from("announcement_attachments").insert(
        data.attachments.map((a) => ({
          announcement_id: row.id,
          file_name: a.file_name,
          file_path: a.file_path,
          mime_type: a.mime_type ?? null,
          size_bytes: a.size_bytes ?? null,
          uploaded_by: context.userId,
        })),
      );
    }

    if (status === "published") {
      try {
        await notifyAudience({
          announcementId: row.id,
          schoolId: actor.schoolId,
          type: data.type,
          title: data.title,
          priority: data.priority,
          classId: data.classId ?? null,
          sectionId: data.sectionId ?? null,
        });
      } catch (e) { console.error("ann notify", e); }
    }

    return { ok: true as const, id: row.id, status };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  publishAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

export const updateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    const { data: existing } = await supabaseAdmin.from("announcements").select("created_by, status").eq("id", data.id).maybeSingle();
    if (!existing) return { ok: false as const, error: "Not found." };
    if (!actor.isAdmin && existing.created_by !== context.userId) return { ok: false as const, error: "Not allowed." };
    const { error } = await supabaseAdmin.from("announcements").update({
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      publish_at: data.publishAt || null,
      expires_at: data.expiresAt || null,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    const { data: existing } = await supabaseAdmin.from("announcements").select("created_by").eq("id", data.id).maybeSingle();
    if (!existing) return { ok: false as const, error: "Not found." };
    if (!actor.isAdmin && existing.created_by !== context.userId) return { ok: false as const, error: "Not allowed." };
    const { error } = await supabaseAdmin.from("announcements").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const publishAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    const { data: existing } = await supabaseAdmin.from("announcements")
      .select("id, school_id, type, title, priority, class_id, section_id, status, created_by")
      .eq("id", data.id).maybeSingle();
    if (!existing) return { ok: false as const, error: "Not found." };
    if (!actor.isAdmin && existing.created_by !== context.userId) return { ok: false as const, error: "Not allowed." };
    if (existing.status === "published") return { ok: true as const, already: true };
    const { error } = await supabaseAdmin.from("announcements").update({
      status: "published",
      publish_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    try {
      await notifyAudience({
        announcementId: existing.id,
        schoolId: existing.school_id,
        type: existing.type as "school_wide" | "class_specific",
        title: existing.title,
        priority: existing.priority,
        classId: existing.class_id,
        sectionId: existing.section_id,
      });
    } catch (e) { console.error("publish notify", e); }
    return { ok: true as const };
  });

export const archiveAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    const { data: existing } = await supabaseAdmin.from("announcements").select("created_by").eq("id", data.id).maybeSingle();
    if (!existing) return { ok: false as const, error: "Not found." };
    if (!actor.isAdmin && existing.created_by !== context.userId) return { ok: false as const, error: "Not allowed." };
    const { error } = await supabaseAdmin.from("announcements").update({ status: "archived" }).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// Lazy expire pass
async function expirePass(schoolId: string) {
  await supabaseAdmin.from("announcements")
    .update({ status: "expired" })
    .eq("school_id", schoolId)
    .neq("status", "expired").neq("status", "archived")
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString());
  // Auto-publish scheduled past publish_at
  await supabaseAdmin.from("announcements")
    .update({ status: "published" })
    .eq("school_id", schoolId)
    .eq("status", "scheduled")
    .not("publish_at", "is", null)
    .lte("publish_at", new Date().toISOString());
}

const ListInput = z.object({
  status: z.string().nullable().optional(),
  type: z.enum(TYPES).nullable().optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  q: z.string().nullable().optional(),
});

export const listAnnouncements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ListInput.parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { rows: [] };
    await expirePass(actor.schoolId);
    let q = supabaseAdmin.from("announcements")
      .select("id, type, title, description, category, priority, status, publish_at, expires_at, class_id, section_id, created_by, created_at")
      .eq("school_id", actor.schoolId)
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status as never);
    if (data.type) q = q.eq("type", data.type);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00Z`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59Z`);
    if (data.q) q = q.ilike("title", `%${data.q}%`);
    if (!actor.isAdmin) {
      const { sectionIds } = await getTeacherSectionIds(context.userId);
      const orParts: string[] = [`created_by.eq.${context.userId}`, `type.eq.school_wide`];
      if (sectionIds.length) orParts.push(`section_id.in.(${sectionIds.join(",")})`);
      q = q.or(orParts.join(","));
    }
    const { data: rows } = await q.limit(500);
    const list = rows ?? [];
    const classIds = Array.from(new Set(list.map((r) => r.class_id).filter(Boolean) as string[]));
    const sectionIds = Array.from(new Set(list.map((r) => r.section_id).filter(Boolean) as string[]));
    const userIds = Array.from(new Set(list.map((r) => r.created_by)));
    const [{ data: classes }, { data: sections }, { data: profiles }] = await Promise.all([
      classIds.length ? supabaseAdmin.from("classes").select("id, name").in("id", classIds) : Promise.resolve({ data: [] }),
      sectionIds.length ? supabaseAdmin.from("sections").select("id, name").in("id", sectionIds) : Promise.resolve({ data: [] }),
      userIds.length ? supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
    ]);
    const cMap = new Map((classes ?? []).map((c) => [c.id, c.name]));
    const sMap = new Map((sections ?? []).map((s) => [s.id, s.name]));
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    return {
      rows: list.map((r) => ({
        ...r,
        class_name: r.class_id ? (cMap.get(r.class_id) ?? "—") : null,
        section_name: r.section_id ? (sMap.get(r.section_id) ?? "—") : null,
        audience: r.type === "school_wide"
          ? "School-Wide"
          : `${cMap.get(r.class_id ?? "") ?? "—"}${r.section_id ? " · " + (sMap.get(r.section_id) ?? "—") : " (All sections)"}`,
        creator_name: pMap.get(r.created_by) ?? "—",
        can_edit: actor.isAdmin || r.created_by === context.userId,
      })),
    };
  });

export const getAnnouncementDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: a } = await supabaseAdmin.from("announcements").select("*").eq("id", data.id).maybeSingle();
    if (!a) return { ok: false as const, error: "Not found." };
    const { data: atts } = await supabaseAdmin.from("announcement_attachments")
      .select("id, file_name, file_path, mime_type, size_bytes").eq("announcement_id", data.id);
    const attachments = await Promise.all(
      (atts ?? []).map(async (att) => {
        const { data: signed } = await supabaseAdmin.storage.from(ATT_BUCKET).createSignedUrl(att.file_path, 60 * 60);
        return { ...att, url: signed?.signedUrl ?? null };
      }),
    );
    return { ok: true as const, announcement: a, attachments };
  });

const ParentListInput = z.object({
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  q: z.string().nullable().optional(),
  studentId: z.string().uuid().nullable().optional(),
});

export const getParentAnnouncements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ParentListInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: parent } = await supabaseAdmin.from("parents")
      .select("id, school_id").eq("user_id", context.userId).maybeSingle();
    if (!parent) return { rows: [], children: [] };
    if (parent.school_id) await expirePass(parent.school_id);

    const { data: links } = await supabaseAdmin.from("parent_students").select("student_id").eq("parent_id", parent.id);
    const studentIds = (links ?? []).map((l) => l.student_id);
    if (!studentIds.length) return { rows: [], children: [] };
    const { data: students } = await supabaseAdmin.from("students")
      .select("id, full_name, class_id, section_id, school_id").in("id", studentIds);
    const targetStudents = data.studentId ? (students ?? []).filter((s) => s.id === data.studentId) : (students ?? []);
    const schoolIds = Array.from(new Set(targetStudents.map((s) => s.school_id).filter(Boolean) as string[]));
    const classIds = Array.from(new Set(targetStudents.map((s) => s.class_id).filter(Boolean) as string[]));
    const sectionIds = Array.from(new Set(targetStudents.map((s) => s.section_id).filter(Boolean) as string[]));
    if (!schoolIds.length) return { rows: [], children: (students ?? []).map((s) => ({ id: s.id, full_name: s.full_name })) };

    let q = supabaseAdmin.from("announcements")
      .select("id, type, title, description, category, priority, status, publish_at, expires_at, class_id, section_id, created_by, created_at")
      .in("school_id", schoolIds)
      .eq("status", "published")
      .order("publish_at", { ascending: false }).limit(500);
    const ors: string[] = ["type.eq.school_wide"];
    if (sectionIds.length) ors.push(`section_id.in.(${sectionIds.join(",")})`);
    if (classIds.length) ors.push(`and(type.eq.class_specific,section_id.is.null,class_id.in.(${classIds.join(",")}))`);
    q = q.or(ors.join(","));
    if (data.from) q = q.gte("publish_at", `${data.from}T00:00:00Z`);
    if (data.to) q = q.lte("publish_at", `${data.to}T23:59:59Z`);
    if (data.q) q = q.ilike("title", `%${data.q}%`);

    const { data: rows } = await q;
    const list = rows ?? [];
    const ids = list.map((r) => r.id);
    const { data: atts } = ids.length
      ? await supabaseAdmin.from("announcement_attachments").select("id, announcement_id, file_name, file_path, mime_type").in("announcement_id", ids)
      : { data: [] as Array<{ id: string; announcement_id: string; file_name: string; file_path: string; mime_type: string | null }> };
    const attMap = new Map<string, Array<{ id: string; file_name: string; url: string | null }>>();
    for (const a of atts ?? []) {
      const { data: signed } = await supabaseAdmin.storage.from(ATT_BUCKET).createSignedUrl(a.file_path, 60 * 60);
      const arr = attMap.get(a.announcement_id) ?? [];
      arr.push({ id: a.id, file_name: a.file_name, url: signed?.signedUrl ?? null });
      attMap.set(a.announcement_id, arr);
    }
    const { data: reads } = ids.length
      ? await supabaseAdmin.from("announcement_reads").select("announcement_id").eq("user_id", context.userId).in("announcement_id", ids)
      : { data: [] as Array<{ announcement_id: string }> };
    const readSet = new Set((reads ?? []).map((r) => r.announcement_id));

    return {
      children: (students ?? []).map((s) => ({ id: s.id, full_name: s.full_name })),
      rows: list.map((r) => ({
        ...r,
        attachments: attMap.get(r.id) ?? [],
        is_read: readSet.has(r.id),
      })),
    };
  });

export const markAnnouncementRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await supabaseAdmin.from("announcement_reads")
      .upsert({ announcement_id: data.id, user_id: context.userId }, { onConflict: "announcement_id,user_id" });
    return { ok: true as const };
  });

export const getAnnouncementWidgets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId && !actor.isParent) {
      return { admin: null, teacher: null, parent: null };
    }
    if (actor.schoolId) await expirePass(actor.schoolId);

    // Admin counts
    if (actor.isAdmin && actor.schoolId) {
      const base = () => supabaseAdmin.from("announcements").select("id", { count: "exact", head: true }).eq("school_id", actor.schoolId!);
      const [tot, pub, sch, exp] = await Promise.all([
        base(), base().eq("status", "published"), base().eq("status", "scheduled"), base().eq("status", "expired"),
      ]);
      return {
        admin: { total: tot.count ?? 0, published: pub.count ?? 0, scheduled: sch.count ?? 0, expired: exp.count ?? 0 },
        teacher: null, parent: null,
      };
    }

    // Teacher widgets
    if (actor.isTeacher && actor.schoolId) {
      const { sectionIds } = await getTeacherSectionIds(context.userId);
      const orParts: string[] = [`created_by.eq.${context.userId}`, `type.eq.school_wide`];
      if (sectionIds.length) orParts.push(`section_id.in.(${sectionIds.join(",")})`);
      const nowIso = new Date().toISOString();
      const [{ data: recent }, { data: upcoming }] = await Promise.all([
        supabaseAdmin.from("announcements").select("id, title, priority, status, publish_at")
          .eq("school_id", actor.schoolId).eq("status", "published")
          .or(orParts.join(",")).order("publish_at", { ascending: false }).limit(5),
        supabaseAdmin.from("announcements").select("id, title, priority, status, publish_at")
          .eq("school_id", actor.schoolId).eq("status", "scheduled")
          .or(orParts.join(",")).gt("publish_at", nowIso).order("publish_at", { ascending: true }).limit(5),
      ]);
      return { admin: null, teacher: { recent: recent ?? [], upcoming: upcoming ?? [] }, parent: null };
    }

    // Parent widgets
    if (actor.isParent) {
      const { data: parent } = await supabaseAdmin.from("parents").select("id, school_id").eq("user_id", context.userId).maybeSingle();
      if (!parent) return { admin: null, teacher: null, parent: { latest: [], unread: 0, urgent: [] } };
      const { data: links } = await supabaseAdmin.from("parent_students").select("student_id").eq("parent_id", parent.id);
      const sIds = (links ?? []).map((l) => l.student_id);
      if (!sIds.length) return { admin: null, teacher: null, parent: { latest: [], unread: 0, urgent: [] } };
      const { data: students } = await supabaseAdmin.from("students").select("id, class_id, section_id, school_id").in("id", sIds);
      const classIds = Array.from(new Set((students ?? []).map((s) => s.class_id).filter(Boolean) as string[]));
      const sectionIds = Array.from(new Set((students ?? []).map((s) => s.section_id).filter(Boolean) as string[]));
      const schoolIds = Array.from(new Set((students ?? []).map((s) => s.school_id).filter(Boolean) as string[]));
      if (!schoolIds.length) return { admin: null, teacher: null, parent: { latest: [], unread: 0, urgent: [] } };
      const ors: string[] = ["type.eq.school_wide"];
      if (sectionIds.length) ors.push(`section_id.in.(${sectionIds.join(",")})`);
      if (classIds.length) ors.push(`and(type.eq.class_specific,section_id.is.null,class_id.in.(${classIds.join(",")}))`);
      const base = () => supabaseAdmin.from("announcements")
        .select("id, title, priority, publish_at")
        .in("school_id", schoolIds).eq("status", "published").or(ors.join(","));
      const [{ data: latest }, { data: urgent }, allRows] = await Promise.all([
        base().order("publish_at", { ascending: false }).limit(5),
        base().eq("priority", "urgent").order("publish_at", { ascending: false }).limit(5),
        base().limit(500),
      ]);
      const allIds = (allRows.data ?? []).map((r) => r.id);
      let unreadCount = 0;
      if (allIds.length) {
        const { data: reads } = await supabaseAdmin.from("announcement_reads").select("announcement_id").eq("user_id", context.userId).in("announcement_id", allIds);
        const readSet = new Set((reads ?? []).map((r) => r.announcement_id));
        unreadCount = allIds.filter((id) => !readSet.has(id)).length;
      }
      return { admin: null, teacher: null, parent: { latest: latest ?? [], urgent: urgent ?? [], unread: unreadCount } };
    }

    return { admin: null, teacher: null, parent: null };
  });
