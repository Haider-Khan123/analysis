import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/postgres/auth-middleware";
import { db } from "@/integrations/postgres/client.server";

const todayUTC = () => new Date().toISOString().slice(0, 10);

async function getActor(userId: string) {
  const { data: profile } = await db
    .from("profiles").select("school_id, full_name").eq("id", userId).maybeSingle();
  const { data: rolesRows } = await db
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

async function teacherCanSection(userId: string, sectionId: string): Promise<boolean> {
  const { data: t } = await db.from("teachers").select("id").eq("user_id", userId).maybeSingle();
  if (!t) return false;
  const [{ data: st }, { data: ct }] = await Promise.all([
    db.from("section_teachers").select("id").eq("teacher_id", t.id).eq("section_id", sectionId).maybeSingle(),
    db.from("class_teachers").select("id").eq("teacher_id", t.id).eq("section_id", sectionId).maybeSingle(),
  ]);
  return !!(st || ct);
}

async function getTeacherSectionIds(userId: string): Promise<string[]> {
  const { data: t } = await db.from("teachers").select("id").eq("user_id", userId).maybeSingle();
  if (!t) return [];
  const [{ data: ct }, { data: st }, { data: tc }] = await Promise.all([
    db.from("class_teachers").select("section_id, class_id").eq("teacher_id", t.id),
    db.from("section_teachers").select("section_id").eq("teacher_id", t.id),
    db.from("teacher_classes").select("class_id").eq("teacher_id", t.id),
  ]);
  const sectionIds = new Set<string>();
  (st ?? []).forEach((r) => sectionIds.add(r.section_id));
  (ct ?? []).forEach((r) => sectionIds.add(r.section_id));
  const classIds = new Set<string>();
  (tc ?? []).forEach((r) => classIds.add(r.class_id));
  (ct ?? []).forEach((r) => classIds.add(r.class_id));
  if (classIds.size) {
    const { data: extra } = await db.from("sections").select("id").in("class_id", Array.from(classIds));
    (extra ?? []).forEach((s) => sectionIds.add(s.id));
  }
  return Array.from(sectionIds);
}

// Re-export scope from attendance pattern would couple; just inline a similar helper
export const getHomeworkScope = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { classes: [], sections: [] };
    if (actor.isAdmin) {
      const [{ data: classes }, { data: sections }] = await Promise.all([
        db.from("classes").select("id, name").eq("school_id", actor.schoolId).order("name"),
        db.from("sections").select("id, name, class_id").eq("school_id", actor.schoolId).order("name"),
      ]);
      return { classes: classes ?? [], sections: sections ?? [] };
    }
    const { data: t } = await db.from("teachers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!t) return { classes: [], sections: [] };
    const [{ data: tc }, { data: ct }, { data: st }] = await Promise.all([
      db.from("teacher_classes").select("class_id").eq("teacher_id", t.id),
      db.from("class_teachers").select("class_id, section_id").eq("teacher_id", t.id),
      db.from("section_teachers").select("section_id").eq("teacher_id", t.id),
    ]);
    const classIds = new Set<string>();
    (tc ?? []).forEach((r) => classIds.add(r.class_id));
    (ct ?? []).forEach((r) => classIds.add(r.class_id));
    const sectionIds = new Set<string>();
    (ct ?? []).forEach((r) => sectionIds.add(r.section_id));
    (st ?? []).forEach((r) => sectionIds.add(r.section_id));
    const cArr = Array.from(classIds);
    const sArr = Array.from(sectionIds);
    const [{ data: classes }, { data: sections }] = await Promise.all([
      cArr.length
        ? db.from("classes").select("id, name").in("id", cArr).eq("school_id", actor.schoolId).order("name")
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      sArr.length
        ? db.from("sections").select("id, name, class_id").in("id", sArr).eq("school_id", actor.schoolId).order("name")
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; class_id: string }> }),
    ]);
    if (cArr.length) {
      const { data: extra } = await db
        .from("sections").select("id, name, class_id").in("class_id", cArr).eq("school_id", actor.schoolId);
      const known = new Set((sections ?? []).map((s) => s.id));
      (extra ?? []).forEach((s) => { if (!known.has(s.id)) sections!.push(s); });
    }
    return { classes: classes ?? [], sections: sections ?? [] };
  });

const HomeworkInput = z.object({
  classId: z.string().uuid(),
  sectionId: z.string().uuid().nullable(),
  scope: z.enum(["class", "section"]),
  subject: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional().nullable(),
  assignedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attachments: z.array(z.object({
    file_name: z.string().min(1).max(200),
    file_path: z.string().min(1).max(500),
    mime_type: z.string().max(120).optional().nullable(),
    size_bytes: z.number().int().nonnegative().optional().nullable(),
  })).max(10).optional().default([]),
});

export const createHomework = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i) => HomeworkInput.parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { ok: false as const, error: "No school." };

    if (data.scope === "section") {
      if (!data.sectionId) return { ok: false as const, error: "Section required." };
      if (!actor.isAdmin) {
        const ok = await teacherCanSection(context.userId, data.sectionId);
        if (!ok) return { ok: false as const, error: "Not assigned to this section." };
      }
    } else if (!actor.isAdmin) {
      // class scope — teacher must own at least one section in this class
      const sectionIds = await getTeacherSectionIds(context.userId);
      const { data: secs } = await db.from("sections").select("id").eq("class_id", data.classId).eq("school_id", actor.schoolId);
      const allowed = (secs ?? []).some((s) => sectionIds.includes(s.id));
      if (!allowed) return { ok: false as const, error: "Not assigned to this class." };
    }

    const { data: hw, error } = await db.from("homework").insert({
      school_id: actor.schoolId,
      class_id: data.classId,
      section_id: data.scope === "section" ? data.sectionId : null,
      subject: data.subject,
      title: data.title,
      description: data.description || null,
      assigned_date: data.assignedDate,
      due_date: data.dueDate,
      scope: data.scope,
      created_by: context.userId,
    }).select("id").single();
    if (error || !hw) return { ok: false as const, error: error?.message ?? "Insert failed." };

    if (data.attachments.length) {
      await db.from("homework_attachments").insert(
        data.attachments.map((a) => ({
          homework_id: hw.id,
          file_name: a.file_name,
          file_path: a.file_path,
          mime_type: a.mime_type ?? null,
          size_bytes: a.size_bytes ?? null,
          uploaded_by: context.userId,
        })),
      );
    }

    // notify linked parents
    try { await notifyParentsOfHomework({ homeworkId: hw.id, schoolId: actor.schoolId, title: data.title, subject: data.subject, dueDate: data.dueDate, classId: data.classId, sectionId: data.scope === "section" ? data.sectionId : null }); }
    catch (e) { console.error("hw notify", e); }

    return { ok: true as const, id: hw.id };
  });

async function notifyParentsOfHomework(args: { homeworkId: string; schoolId: string; title: string; subject: string; dueDate: string; classId: string; sectionId: string | null }) {
  // Find target students
  let q = db.from("students").select("id, full_name").eq("school_id", args.schoolId).eq("status", "active");
  if (args.sectionId) q = q.eq("section_id", args.sectionId);
  else q = q.eq("class_id", args.classId);
  const { data: students } = await q;
  if (!students?.length) return;
  const studentIds = students.map((s) => s.id);
  const { data: links } = await db.from("parent_students").select("parent_id, student_id").in("student_id", studentIds);
  if (!links?.length) return;
  const parentIds = Array.from(new Set(links.map((l) => l.parent_id)));
  const { data: parents } = await db.from("parents").select("id, user_id").in("id", parentIds);
  const userByParent = new Map((parents ?? []).map((p) => [p.id, p.user_id]));
  const notifs = links
    .map((l) => {
      const uid = userByParent.get(l.parent_id);
      if (!uid) return null;
      return {
        user_id: uid,
        school_id: args.schoolId,
        type: "homework_new",
        title: "New Homework Assigned",
        body: `${args.subject}: ${args.title} (due ${args.dueDate})`,
        student_id: l.student_id,
        metadata: { homework_id: args.homeworkId } as unknown as never,
      };
    })
    .filter((n): n is NonNullable<typeof n> => !!n);
  if (notifs.length) await db.from("notifications").insert(notifs);
}

export const updateHomework = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i) => z.object({
    id: z.string().uuid(),
    subject: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).optional().nullable(),
    assignedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    const { data: existing } = await db.from("homework").select("created_by, school_id").eq("id", data.id).maybeSingle();
    if (!existing) return { ok: false as const, error: "Not found." };
    if (!actor.isAdmin && existing.created_by !== context.userId) return { ok: false as const, error: "Not allowed." };
    const { error } = await db.from("homework").update({
      subject: data.subject, title: data.title, description: data.description || null,
      assigned_date: data.assignedDate, due_date: data.dueDate, updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const deleteHomework = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    const { data: existing } = await db.from("homework").select("created_by").eq("id", data.id).maybeSingle();
    if (!existing) return { ok: false as const, error: "Not found." };
    if (!actor.isAdmin && existing.created_by !== context.userId) return { ok: false as const, error: "Not allowed." };
    const { error } = await db.from("homework").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const listHomework = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i) => z.object({
    classId: z.string().uuid().nullable().optional(),
    sectionId: z.string().uuid().nullable().optional(),
    subject: z.string().nullable().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { rows: [] };
    let q = db.from("homework").select("id, title, subject, assigned_date, due_date, class_id, section_id, scope, created_by, created_at")
      .eq("school_id", actor.schoolId).order("due_date", { ascending: false });
    if (data.classId) q = q.eq("class_id", data.classId);
    if (data.sectionId) q = q.eq("section_id", data.sectionId);
    if (data.subject) q = q.ilike("subject", `%${data.subject}%`);
    if (data.from) q = q.gte("assigned_date", data.from);
    if (data.to) q = q.lte("assigned_date", data.to);
    if (!actor.isAdmin) {
      const sIds = await getTeacherSectionIds(context.userId);
      // include rows where created_by = me OR section in my sections OR scope=class & class has my section
      const { data: mySecs } = await db.from("sections").select("id, class_id").in("id", sIds.length ? sIds : ["00000000-0000-0000-0000-000000000000"]);
      const myClasses = Array.from(new Set((mySecs ?? []).map((s) => s.class_id)));
      // simplest: rely on RLS — which already restricts. Use admin client but filter manually.
      const orParts: string[] = [`created_by.eq.${context.userId}`];
      if (sIds.length) orParts.push(`section_id.in.(${sIds.join(",")})`);
      if (myClasses.length) orParts.push(`and(scope.eq.class,class_id.in.(${myClasses.join(",")}))`);
      q = q.or(orParts.join(","));
    }
    const { data: rows } = await q.limit(500);
    const list = rows ?? [];
    const classIds = Array.from(new Set(list.map((r) => r.class_id)));
    const sectionIds = Array.from(new Set(list.map((r) => r.section_id).filter(Boolean) as string[]));
    const userIds = Array.from(new Set(list.map((r) => r.created_by)));
    const [{ data: classes }, { data: sections }, { data: profiles }] = await Promise.all([
      classIds.length ? db.from("classes").select("id, name").in("id", classIds) : Promise.resolve({ data: [] }),
      sectionIds.length ? db.from("sections").select("id, name").in("id", sectionIds) : Promise.resolve({ data: [] }),
      userIds.length ? db.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
    ]);
    const cMap = new Map((classes ?? []).map((c) => [c.id, c.name]));
    const sMap = new Map((sections ?? []).map((s) => [s.id, s.name]));
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const today = todayUTC();
    return {
      rows: list.map((r) => ({
        ...r,
        class_name: cMap.get(r.class_id) ?? "—",
        section_name: r.section_id ? (sMap.get(r.section_id) ?? "—") : "All sections",
        teacher_name: pMap.get(r.created_by) ?? "—",
        status: r.due_date < today ? "overdue" : r.due_date === today ? "due_today" : "upcoming",
        can_edit: actor.isAdmin || r.created_by === context.userId,
      })),
    };
  });

export const getHomeworkDetail = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: hw } = await db.from("homework").select("*").eq("id", data.id).maybeSingle();
    if (!hw) return { ok: false as const, error: "Not found." };
    const { data: atts } = await db.from("homework_attachments").select("id, file_name, file_path, mime_type, size_bytes").eq("homework_id", data.id);
    const attachments = await Promise.all(
      (atts ?? []).map(async (a) => {
        const { data: signed } = await db.storage.from("homework-attachments").createSignedUrl(a.file_path, 60 * 60);
        return { ...a, url: signed?.signedUrl ?? null };
      }),
    );
    return { ok: true as const, homework: hw, attachments };
  });

export const getParentHomework = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i) => z.object({
    studentId: z.string().uuid().nullable().optional(),
    subject: z.string().nullable().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: parent } = await db.from("parents").select("id").eq("user_id", context.userId).maybeSingle();
    if (!parent) return { rows: [], children: [] };
    const { data: links } = await db.from("parent_students").select("student_id").eq("parent_id", parent.id);
    const studentIds = (links ?? []).map((l) => l.student_id);
    if (!studentIds.length) return { rows: [], children: [] };
    const { data: students } = await db.from("students").select("id, full_name, class_id, section_id").in("id", studentIds);
    const children = students ?? [];
    const targetStudents = data.studentId ? children.filter((s) => s.id === data.studentId) : children;
    if (!targetStudents.length) return { rows: [], children };

    const sectionIds = Array.from(new Set(targetStudents.map((s) => s.section_id).filter(Boolean) as string[]));
    const classIds = Array.from(new Set(targetStudents.map((s) => s.class_id).filter(Boolean) as string[]));

    let q = db.from("homework").select("id, title, subject, description, assigned_date, due_date, class_id, section_id, scope, created_by")
      .order("due_date", { ascending: false }).limit(500);
    const ors: string[] = [];
    if (sectionIds.length) ors.push(`section_id.in.(${sectionIds.join(",")})`);
    if (classIds.length) ors.push(`and(scope.eq.class,class_id.in.(${classIds.join(",")}))`);
    if (ors.length) q = q.or(ors.join(","));
    if (data.subject) q = q.ilike("subject", `%${data.subject}%`);
    if (data.from) q = q.gte("assigned_date", data.from);
    if (data.to) q = q.lte("assigned_date", data.to);
    const { data: rows } = await q;
    const list = rows ?? [];

    const hwIds = list.map((r) => r.id);
    const { data: atts } = hwIds.length
      ? await db.from("homework_attachments").select("id, homework_id, file_name, file_path, mime_type").in("homework_id", hwIds)
      : { data: [] as Array<{ id: string; homework_id: string; file_name: string; file_path: string; mime_type: string | null }> };
    const attsByHw = new Map<string, Array<{ id: string; file_name: string; url: string | null; mime_type: string | null }>>();
    for (const a of atts ?? []) {
      const { data: signed } = await db.storage.from("homework-attachments").createSignedUrl(a.file_path, 60 * 60);
      const arr = attsByHw.get(a.homework_id) ?? [];
      arr.push({ id: a.id, file_name: a.file_name, url: signed?.signedUrl ?? null, mime_type: a.mime_type });
      attsByHw.set(a.homework_id, arr);
    }

    const today = todayUTC();
    const userIds = Array.from(new Set(list.map((r) => r.created_by)));
    const { data: profiles } = userIds.length
      ? await db.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as Array<{ id: string; full_name: string | null }> };
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    return {
      children: children.map((c) => ({ id: c.id, full_name: c.full_name })),
      rows: list.map((r) => ({
        ...r,
        teacher_name: pMap.get(r.created_by) ?? "—",
        attachments: attsByHw.get(r.id) ?? [],
        status: r.due_date < today ? "overdue" : r.due_date === today ? "due_today" : "upcoming",
      })),
    };
  });

export const getTeacherHomeworkWidgets = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { dueToday: [], recent: [], upcoming: [] };
    const today = todayUTC();
    const base = () => db.from("homework")
      .select("id, title, subject, due_date, assigned_date, class_id, section_id")
      .eq("school_id", actor.schoolId!)
      .eq("created_by", context.userId);
    const [{ data: dueToday }, { data: recent }, { data: upcoming }] = await Promise.all([
      base().eq("due_date", today).limit(10),
      base().order("created_at", { ascending: false }).limit(5),
      base().gt("due_date", today).order("due_date", { ascending: true }).limit(5),
    ]);
    return { dueToday: dueToday ?? [], recent: recent ?? [], upcoming: upcoming ?? [] };
  });

export const getParentHomeworkWidgets = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const today = todayUTC();
    const { data: parent } = await db.from("parents").select("id").eq("user_id", context.userId).maybeSingle();
    if (!parent) return { pending: [], upcoming: [], recent: [] };
    const { data: links } = await db.from("parent_students").select("student_id").eq("parent_id", parent.id);
    const studentIds = (links ?? []).map((l) => l.student_id);
    if (!studentIds.length) return { pending: [], upcoming: [], recent: [] };
    const { data: students } = await db.from("students").select("id, class_id, section_id").in("id", studentIds);
    const sectionIds = Array.from(new Set((students ?? []).map((s) => s.section_id).filter(Boolean) as string[]));
    const classIds = Array.from(new Set((students ?? []).map((s) => s.class_id).filter(Boolean) as string[]));
    if (!sectionIds.length && !classIds.length) return { pending: [], upcoming: [], recent: [] };
    const ors: string[] = [];
    if (sectionIds.length) ors.push(`section_id.in.(${sectionIds.join(",")})`);
    if (classIds.length) ors.push(`and(scope.eq.class,class_id.in.(${classIds.join(",")}))`);
    const base = () => db.from("homework").select("id, title, subject, due_date, assigned_date").or(ors.join(","));
    const [{ data: pending }, { data: upcoming }, { data: recent }] = await Promise.all([
      base().lte("due_date", today).order("due_date", { ascending: false }).limit(5),
      base().gt("due_date", today).order("due_date", { ascending: true }).limit(5),
      base().order("assigned_date", { ascending: false }).limit(5),
    ]);
    return { pending: pending ?? [], upcoming: upcoming ?? [], recent: recent ?? [] };
  });
