import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ProgressType = "observation" | "behavior" | "participation" | "academic";
export type BehaviorRating = "excellent" | "good" | "average" | "needs_improvement";
export type ParticipationLevel = "highly_active" | "active" | "moderate" | "passive";

async function getActor(userId: string) {
  const { data: profile } = await supabaseAdmin.from("profiles").select("school_id").eq("id", userId).maybeSingle();
  const { data: rolesRows } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (rolesRows ?? []).map((r) => r.role as string);
  return {
    schoolId: profile?.school_id ?? null,
    isAdmin: roles.includes("admin"),
    isTeacher: roles.includes("teacher"),
    isParent: roles.includes("parent"),
  };
}

async function getTeacherSectionIds(userId: string): Promise<string[]> {
  const { data: t } = await supabaseAdmin.from("teachers").select("id").eq("user_id", userId).maybeSingle();
  if (!t) return [];
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
  return Array.from(sectionIds);
}

export const getProgressScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { classes: [], sections: [], students: [] };
    if (actor.isAdmin) {
      const [{ data: classes }, { data: sections }, { data: students }] = await Promise.all([
        supabaseAdmin.from("classes").select("id, name").eq("school_id", actor.schoolId).order("name"),
        supabaseAdmin.from("sections").select("id, name, class_id").eq("school_id", actor.schoolId).order("name"),
        supabaseAdmin.from("students").select("id, full_name, class_id, section_id").eq("school_id", actor.schoolId).eq("status", "active").order("full_name").limit(2000),
      ]);
      return { classes: classes ?? [], sections: sections ?? [], students: students ?? [] };
    }
    const sectionIds = await getTeacherSectionIds(context.userId);
    if (!sectionIds.length) return { classes: [], sections: [], students: [] };
    const { data: sections } = await supabaseAdmin.from("sections").select("id, name, class_id").in("id", sectionIds);
    const classIds = Array.from(new Set((sections ?? []).map((s) => s.class_id)));
    const [{ data: classes }, { data: students }] = await Promise.all([
      classIds.length ? supabaseAdmin.from("classes").select("id, name").in("id", classIds) : Promise.resolve({ data: [] }),
      supabaseAdmin.from("students").select("id, full_name, class_id, section_id").in("section_id", sectionIds).eq("status", "active").order("full_name"),
    ]);
    return { classes: classes ?? [], sections: sections ?? [], students: students ?? [] };
  });

const BaseInput = z.object({
  studentId: z.string().uuid(),
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["observation", "behavior", "participation", "academic"]),
  title: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  subject: z.string().trim().max(80).optional().nullable(),
  behavior: z.enum(["excellent", "good", "average", "needs_improvement"]).optional().nullable(),
  participation: z.enum(["highly_active", "active", "moderate", "passive"]).optional().nullable(),
  strengths: z.string().trim().max(2000).optional().nullable(),
  improvements: z.string().trim().max(2000).optional().nullable(),
});

export const createProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => BaseInput.parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { ok: false as const, error: "No school." };

    const { data: student } = await supabaseAdmin.from("students")
      .select("id, school_id, class_id, section_id, full_name").eq("id", data.studentId).maybeSingle();
    if (!student || student.school_id !== actor.schoolId) return { ok: false as const, error: "Student not found." };

    if (!actor.isAdmin) {
      const sIds = await getTeacherSectionIds(context.userId);
      if (!student.section_id || !sIds.includes(student.section_id)) {
        return { ok: false as const, error: "Not assigned to this student." };
      }
    }

    const { data: inserted, error } = await supabaseAdmin.from("student_progress").insert({
      school_id: actor.schoolId,
      student_id: student.id,
      class_id: student.class_id,
      section_id: student.section_id,
      teacher_user_id: context.userId,
      record_date: data.recordDate,
      type: data.type,
      title: data.title || null,
      notes: data.notes || null,
      subject: data.type === "academic" ? data.subject || null : null,
      behavior: data.type === "behavior" ? data.behavior || null : null,
      participation: data.type === "participation" ? data.participation || null : null,
      strengths: data.type === "academic" ? data.strengths || null : null,
      improvements: data.type === "academic" ? data.improvements || null : null,
    }).select("id").single();
    if (error || !inserted) return { ok: false as const, error: error?.message ?? "Insert failed." };

    try {
      await notifyParents({
        schoolId: actor.schoolId,
        studentId: student.id,
        studentName: student.full_name,
        type: data.type,
        behavior: data.behavior ?? null,
        title: data.title ?? null,
        subject: data.subject ?? null,
      });
    } catch (e) { console.error("progress notify", e); }

    return { ok: true as const, id: inserted.id };
  });

async function notifyParents(args: {
  schoolId: string; studentId: string; studentName: string;
  type: ProgressType; behavior: BehaviorRating | null; title: string | null; subject: string | null;
}) {
  const { data: links } = await supabaseAdmin.from("parent_students").select("parent_id").eq("student_id", args.studentId);
  const parentIds = Array.from(new Set((links ?? []).map((l) => l.parent_id)));
  if (!parentIds.length) return;
  const { data: parents } = await supabaseAdmin.from("parents").select("id, user_id").in("id", parentIds);
  const userIds = (parents ?? []).map((p) => p.user_id).filter(Boolean) as string[];

  const baseTitle = args.type === "academic" ? "New Academic Remark"
    : args.type === "behavior" && args.behavior === "needs_improvement" ? "Behavior Concern Recorded"
    : "New Progress Record";
  const typeTag = args.type === "academic" ? "progress_academic"
    : args.type === "behavior" && args.behavior === "needs_improvement" ? "progress_behavior_concern"
    : "progress_new";
  const body = `${args.studentName}${args.subject ? ` (${args.subject})` : ""}: ${args.title ?? args.type}`;

  const rows = userIds.map((uid) => ({
    user_id: uid, school_id: args.schoolId, type: typeTag,
    title: baseTitle, body, student_id: args.studentId,
  }));
  if (rows.length) await supabaseAdmin.from("notifications").insert(rows);
}

const BatchInput = z.object({
  studentId: z.string().uuid(),
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observation: z.object({ title: z.string().trim().max(160).optional().nullable(), notes: z.string().trim().max(4000).optional().nullable() }),
  behavior: z.object({ behavior: z.enum(["excellent", "good", "average", "needs_improvement"]), notes: z.string().trim().max(4000).optional().nullable() }),
  participation: z.object({ participation: z.enum(["highly_active", "active", "moderate", "passive"]), notes: z.string().trim().max(4000).optional().nullable() }),
  academic: z.object({
    subject: z.string().trim().min(1).max(80),
    title: z.string().trim().max(160).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    strengths: z.string().trim().max(2000).optional().nullable(),
    improvements: z.string().trim().max(2000).optional().nullable(),
  }),
});

export const submitProgressBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => BatchInput.parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { ok: false as const, error: "No school." };

    const { data: student } = await supabaseAdmin.from("students")
      .select("id, school_id, class_id, section_id, full_name").eq("id", data.studentId).maybeSingle();
    if (!student || student.school_id !== actor.schoolId) return { ok: false as const, error: "Student not found." };

    if (!actor.isAdmin) {
      const sIds = await getTeacherSectionIds(context.userId);
      if (!student.section_id || !sIds.includes(student.section_id)) {
        return { ok: false as const, error: "Not assigned to this student." };
      }
    }

    const base = {
      school_id: actor.schoolId,
      student_id: student.id,
      class_id: student.class_id,
      section_id: student.section_id,
      teacher_user_id: context.userId,
      record_date: data.recordDate,
    };

    const rows = [
      { ...base, type: "observation" as const, title: data.observation.title || null, notes: data.observation.notes || null,
        subject: null, behavior: null, participation: null, strengths: null, improvements: null },
      { ...base, type: "behavior" as const, title: null, notes: data.behavior.notes || null,
        subject: null, behavior: data.behavior.behavior, participation: null, strengths: null, improvements: null },
      { ...base, type: "participation" as const, title: null, notes: data.participation.notes || null,
        subject: null, behavior: null, participation: data.participation.participation, strengths: null, improvements: null },
      { ...base, type: "academic" as const, title: data.academic.title || null, notes: data.academic.notes || null,
        subject: data.academic.subject, behavior: null, participation: null,
        strengths: data.academic.strengths || null, improvements: data.academic.improvements || null },
    ];

    const { error } = await supabaseAdmin.from("student_progress").insert(rows);
    if (error) return { ok: false as const, error: error.message };

    try {
      const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
      const teacherName = profile?.full_name ?? "Teacher";
      const { data: links } = await supabaseAdmin.from("parent_students").select("parent_id").eq("student_id", student.id);
      const parentIds = Array.from(new Set((links ?? []).map((l) => l.parent_id)));
      if (parentIds.length) {
        const { data: parents } = await supabaseAdmin.from("parents").select("user_id").in("id", parentIds);
        const userIds = (parents ?? []).map((p) => p.user_id).filter(Boolean) as string[];
        if (userIds.length) {
          await supabaseAdmin.from("notifications").insert(userIds.map((uid) => ({
            user_id: uid, school_id: actor.schoolId, type: "progress_batch",
            title: `Student Progress Tracking by ${teacherName}`,
            body: `New progress record submitted for ${student.full_name}.`,
            student_id: student.id,
          })));
        }
      }
    } catch (e) { console.error("progress batch notify", e); }

    return { ok: true as const };
  });

export const updateProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    id: z.string().uuid(),
    title: z.string().trim().max(160).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    subject: z.string().trim().max(80).optional().nullable(),
    behavior: z.enum(["excellent", "good", "average", "needs_improvement"]).optional().nullable(),
    participation: z.enum(["highly_active", "active", "moderate", "passive"]).optional().nullable(),
    strengths: z.string().trim().max(2000).optional().nullable(),
    improvements: z.string().trim().max(2000).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    const { data: existing } = await supabaseAdmin.from("student_progress").select("teacher_user_id").eq("id", data.id).maybeSingle();
    if (!existing) return { ok: false as const, error: "Not found." };
    if (!actor.isAdmin && existing.teacher_user_id !== context.userId) return { ok: false as const, error: "Not allowed." };
    const { error } = await supabaseAdmin.from("student_progress").update({
      title: data.title || null, notes: data.notes || null, subject: data.subject || null,
      behavior: data.behavior || null, participation: data.participation || null,
      strengths: data.strengths || null, improvements: data.improvements || null,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const deleteProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    const { data: existing } = await supabaseAdmin.from("student_progress").select("teacher_user_id").eq("id", data.id).maybeSingle();
    if (!existing) return { ok: false as const, error: "Not found." };
    if (!actor.isAdmin && existing.teacher_user_id !== context.userId) return { ok: false as const, error: "Not allowed." };
    const { error } = await supabaseAdmin.from("student_progress").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const listProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    type: z.enum(["observation", "behavior", "participation", "academic"]).optional().nullable(),
    studentId: z.string().uuid().optional().nullable(),
    classId: z.string().uuid().optional().nullable(),
    sectionId: z.string().uuid().optional().nullable(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { rows: [] };
    let q = supabaseAdmin.from("student_progress")
      .select("id, record_date, type, title, notes, subject, behavior, participation, strengths, improvements, student_id, section_id, class_id, teacher_user_id, created_at")
      .eq("school_id", actor.schoolId).order("record_date", { ascending: false }).limit(500);
    if (data.type) q = q.eq("type", data.type);
    if (data.studentId) q = q.eq("student_id", data.studentId);
    if (data.sectionId) q = q.eq("section_id", data.sectionId);
    if (data.classId) q = q.eq("class_id", data.classId);
    if (data.from) q = q.gte("record_date", data.from);
    if (data.to) q = q.lte("record_date", data.to);
    if (!actor.isAdmin) {
      const sIds = await getTeacherSectionIds(context.userId);
      const ors: string[] = [`teacher_user_id.eq.${context.userId}`];
      if (sIds.length) ors.push(`section_id.in.(${sIds.join(",")})`);
      q = q.or(ors.join(","));
    }
    const { data: rows } = await q;
    const list = rows ?? [];
    const sIds = Array.from(new Set(list.map((r) => r.student_id)));
    const uIds = Array.from(new Set(list.map((r) => r.teacher_user_id)));
    const [{ data: students }, { data: profiles }] = await Promise.all([
      sIds.length ? supabaseAdmin.from("students").select("id, full_name").in("id", sIds) : Promise.resolve({ data: [] }),
      uIds.length ? supabaseAdmin.from("profiles").select("id, full_name").in("id", uIds) : Promise.resolve({ data: [] }),
    ]);
    const sMap = new Map((students ?? []).map((s) => [s.id, s.full_name]));
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    return {
      rows: list.map((r) => ({
        ...r,
        student_name: sMap.get(r.student_id) ?? "—",
        teacher_name: pMap.get(r.teacher_user_id) ?? "—",
        can_edit: actor.isAdmin || r.teacher_user_id === context.userId,
      })),
    };
  });

export const getParentProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    studentId: z.string().uuid().optional().nullable(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: parent } = await supabaseAdmin.from("parents").select("id").eq("user_id", context.userId).maybeSingle();
    if (!parent) return { rows: [], children: [] };
    const { data: links } = await supabaseAdmin.from("parent_students").select("student_id").eq("parent_id", parent.id);
    const studentIds = (links ?? []).map((l) => l.student_id);
    if (!studentIds.length) return { rows: [], children: [] };
    const { data: students } = await supabaseAdmin.from("students").select("id, full_name").in("id", studentIds);
    const children = students ?? [];
    const target = data.studentId ? [data.studentId] : studentIds;
    let q = supabaseAdmin.from("student_progress")
      .select("id, record_date, type, title, notes, subject, behavior, participation, strengths, improvements, student_id, teacher_user_id")
      .in("student_id", target).order("record_date", { ascending: false }).limit(500);
    if (data.from) q = q.gte("record_date", data.from);
    if (data.to) q = q.lte("record_date", data.to);
    const { data: rows } = await q;
    const list = rows ?? [];
    const uIds = Array.from(new Set(list.map((r) => r.teacher_user_id)));
    const { data: profiles } = uIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", uIds)
      : { data: [] as Array<{ id: string; full_name: string | null }> };
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const sMap = new Map(children.map((s) => [s.id, s.full_name]));
    return {
      children: children.map((c) => ({ id: c.id, full_name: c.full_name })),
      rows: list.map((r) => ({
        ...r,
        teacher_name: pMap.get(r.teacher_user_id) ?? "—",
        student_name: sMap.get(r.student_id) ?? "—",
      })),
    };
  });

export const getTeacherProgressWidgets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { recentObservations: [], needAttention: [], recentRemarks: [] };
    const [{ data: recent }, { data: concerns }, { data: remarks }] = await Promise.all([
      supabaseAdmin.from("student_progress").select("id, record_date, title, notes, student_id, type")
        .eq("teacher_user_id", context.userId).eq("type", "observation").order("record_date", { ascending: false }).limit(5),
      supabaseAdmin.from("student_progress").select("id, record_date, student_id, behavior, notes")
        .eq("teacher_user_id", context.userId).eq("type", "behavior").eq("behavior", "needs_improvement").order("record_date", { ascending: false }).limit(5),
      supabaseAdmin.from("student_progress").select("id, record_date, subject, title, student_id, type")
        .eq("teacher_user_id", context.userId).order("created_at", { ascending: false }).limit(5),
    ]);
    const all = [...(recent ?? []), ...(concerns ?? []), ...(remarks ?? [])];
    const sIds = Array.from(new Set(all.map((r) => r.student_id)));
    const { data: students } = sIds.length
      ? await supabaseAdmin.from("students").select("id, full_name").in("id", sIds)
      : { data: [] as Array<{ id: string; full_name: string }> };
    const sMap = new Map((students ?? []).map((s) => [s.id, s.full_name]));
    const enrich = <T extends { student_id: string }>(r: T) => ({ ...r, student_name: sMap.get(r.student_id) ?? "—" });
    return {
      recentObservations: (recent ?? []).map(enrich),
      needAttention: (concerns ?? []).map(enrich),
      recentRemarks: (remarks ?? []).map(enrich),
    };
  });
