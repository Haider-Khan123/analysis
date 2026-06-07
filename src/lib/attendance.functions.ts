import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AttendanceStatus = "present" | "absent" | "late" | "leave";

const todayUTC = () => new Date().toISOString().slice(0, 10);

// ---------- role / scope helpers ----------
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

async function teacherCanMarkSection(userId: string, sectionId: string): Promise<boolean> {
  const { data: t } = await supabaseAdmin
    .from("teachers").select("id").eq("user_id", userId).maybeSingle();
  if (!t) return false;
  const [{ data: st }, { data: ct }] = await Promise.all([
    supabaseAdmin.from("section_teachers").select("id").eq("teacher_id", t.id).eq("section_id", sectionId).maybeSingle(),
    supabaseAdmin.from("class_teachers").select("id").eq("teacher_id", t.id).eq("section_id", sectionId).maybeSingle(),
  ]);
  return !!(st || ct);
}

// ---------- list students for a section (teacher- or admin-scoped) ----------
export const getSectionRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    sectionId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { ok: false as const, error: "No school." };
    if (!actor.isAdmin) {
      const ok = await teacherCanMarkSection(context.userId, data.sectionId);
      if (!ok) return { ok: false as const, error: "Not assigned to this section." };
    }

    const { data: section } = await supabaseAdmin.from("sections")
      .select("id, name, class_id").eq("id", data.sectionId).eq("school_id", actor.schoolId).maybeSingle();
    if (!section) return { ok: false as const, error: "Section not found." };

    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, full_name, attendance_id, admission_number, photo_url")
      .eq("section_id", data.sectionId)
      .eq("school_id", actor.schoolId)
      .eq("status", "active")
      .order("full_name");

    const { data: records } = await supabaseAdmin
      .from("attendance_records")
      .select("id, student_id, status, remarks, is_draft, marked_by, updated_at")
      .eq("section_id", data.sectionId)
      .eq("attendance_date", data.date);

    const recordByStudent = new Map(
      (records ?? []).map((r) => [r.student_id as string, r]),
    );

    const today = todayUTC();
    const editable = actor.isAdmin || data.date === today;

    return {
      ok: true as const,
      section: { id: section.id, name: section.name, class_id: section.class_id },
      editable,
      isToday: data.date === today,
      students: (students ?? []).map((s) => ({
        ...s,
        record: recordByStudent.get(s.id) ?? null,
      })),
    };
  });

// ---------- get classes/sections the actor can mark ----------
export const getMarkableScope = createServerFn({ method: "GET" })
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

    // Teacher
    const { data: t } = await supabaseAdmin.from("teachers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!t) return { classes: [], sections: [] };

    const [{ data: tc }, { data: ct }, { data: st }] = await Promise.all([
      supabaseAdmin.from("teacher_classes").select("class_id").eq("teacher_id", t.id),
      supabaseAdmin.from("class_teachers").select("class_id, section_id").eq("teacher_id", t.id),
      supabaseAdmin.from("section_teachers").select("section_id").eq("teacher_id", t.id),
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
        ? supabaseAdmin.from("classes").select("id, name").in("id", cArr).eq("school_id", actor.schoolId).order("name")
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      sArr.length
        ? supabaseAdmin.from("sections").select("id, name, class_id").in("id", sArr).eq("school_id", actor.schoolId).order("name")
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; class_id: string }> }),
    ]);
    // Also include all sections that belong to the teacher's classes
    if (cArr.length) {
      const { data: extra } = await supabaseAdmin
        .from("sections").select("id, name, class_id").in("class_id", cArr).eq("school_id", actor.schoolId);
      const known = new Set((sections ?? []).map((s) => s.id));
      (extra ?? []).forEach((s) => { if (!known.has(s.id)) sections!.push(s); });
    }
    return { classes: classes ?? [], sections: sections ?? [] };
  });

// ---------- save attendance + notifications ----------
const SaveRecord = z.object({
  student_id: z.string().uuid(),
  status: z.enum(["present", "absent", "late", "leave"]),
  remarks: z.string().trim().max(300).optional().nullable(),
});

export const saveAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    sectionId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isDraft: z.boolean().default(false),
    records: z.array(SaveRecord).min(1).max(500),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { ok: false as const, error: "No school." };

    const today = todayUTC();
    if (!actor.isAdmin) {
      if (data.date !== today) return { ok: false as const, error: "Teachers can only mark/edit today's attendance." };
      const ok = await teacherCanMarkSection(context.userId, data.sectionId);
      if (!ok) return { ok: false as const, error: "Not assigned to this section." };
    }

    const { data: section } = await supabaseAdmin.from("sections")
      .select("id, class_id, school_id").eq("id", data.sectionId).eq("school_id", actor.schoolId).maybeSingle();
    if (!section) return { ok: false as const, error: "Section not found." };

    // Validate students belong to this section
    const studentIds = data.records.map((r) => r.student_id);
    const { data: validStudents } = await supabaseAdmin
      .from("students").select("id, full_name").in("id", studentIds)
      .eq("section_id", data.sectionId).eq("school_id", actor.schoolId);
    const valid = new Map((validStudents ?? []).map((s) => [s.id, s]));

    const rows = data.records
      .filter((r) => valid.has(r.student_id))
      .map((r) => ({
        school_id: actor.schoolId!,
        class_id: section.class_id,
        section_id: section.id,
        student_id: r.student_id,
        attendance_date: data.date,
        status: r.status,
        remarks: r.remarks || null,
        marked_by: context.userId,
        is_draft: data.isDraft,
      }));

    if (rows.length === 0) return { ok: false as const, error: "No valid students." };

    const { error } = await supabaseAdmin
      .from("attendance_records")
      .upsert(rows, { onConflict: "student_id,attendance_date" });
    if (error) return { ok: false as const, error: error.message };

    // Notifications (only when submitting, not drafts)
    if (!data.isDraft) {
      try {
        await sendAttendanceNotifications({
          schoolId: actor.schoolId!,
          date: data.date,
          rows: rows.map((r) => ({ student_id: r.student_id, status: r.status })),
          studentNameById: new Map((validStudents ?? []).map((s) => [s.id, s.full_name])),
        });
      } catch (e) {
        console.error("notification error", e);
      }
    }

    return { ok: true as const, count: rows.length };
  });

async function sendAttendanceNotifications(args: {
  schoolId: string;
  date: string;
  rows: Array<{ student_id: string; status: AttendanceStatus }>;
  studentNameById: Map<string, string>;
}) {
  const flagged = args.rows.filter((r) => r.status === "absent" || r.status === "late");
  if (flagged.length === 0) return;

  const studentIds = flagged.map((r) => r.student_id);
  const { data: links } = await supabaseAdmin
    .from("parent_students").select("parent_id, student_id").in("student_id", studentIds);
  const parentIds = Array.from(new Set((links ?? []).map((l) => l.parent_id)));
  if (parentIds.length === 0) return;

  const { data: parents } = await supabaseAdmin
    .from("parents").select("id, user_id").in("id", parentIds);
  const parentUserById = new Map((parents ?? []).map((p) => [p.id, p.user_id]));

  const notifications: Array<{
    user_id: string; school_id: string; type: string;
    title: string; body: string; student_id: string;
  }> = [];

  for (const r of flagged) {
    const name = args.studentNameById.get(r.student_id) ?? "Your child";
    const relatedParents = (links ?? []).filter((l) => l.student_id === r.student_id);
    for (const link of relatedParents) {
      const userId = parentUserById.get(link.parent_id);
      if (!userId) continue;
      notifications.push({
        user_id: userId,
        school_id: args.schoolId,
        type: r.status === "absent" ? "absent" : "late",
        title: r.status === "absent" ? "Marked Absent" : "Marked Late",
        body: r.status === "absent"
          ? `${name} was marked absent today (${args.date}).`
          : `${name} was marked late today (${args.date}).`,
        student_id: r.student_id,
      });
    }
  }

  // Consecutive absence check (3-day rule)
  const absentStudentIds = flagged.filter((r) => r.status === "absent").map((r) => r.student_id);
  for (const sid of absentStudentIds) {
    const { data: recent } = await supabaseAdmin
      .from("attendance_records")
      .select("status, attendance_date")
      .eq("student_id", sid)
      .lte("attendance_date", args.date)
      .order("attendance_date", { ascending: false })
      .limit(3);
    if ((recent ?? []).length === 3 && recent!.every((r) => r.status === "absent")) {
      const name = args.studentNameById.get(sid) ?? "Your child";
      const relatedParents = (links ?? []).filter((l) => l.student_id === sid);
      for (const link of relatedParents) {
        const userId = parentUserById.get(link.parent_id);
        if (!userId) continue;
        notifications.push({
          user_id: userId,
          school_id: args.schoolId,
          type: "consecutive_absence",
          title: "Consecutive Absence Alert",
          body: `${name} has been absent for three consecutive school days.`,
          student_id: sid,
        });
      }
    }
  }

  if (notifications.length) {
    await supabaseAdmin.from("notifications").insert(notifications);
  }
}

// ---------- history ----------
export const getAttendanceHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    classId: z.string().uuid().optional().nullable(),
    sectionId: z.string().uuid().optional().nullable(),
    studentId: z.string().uuid().optional().nullable(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { rows: [] };

    let scopeSectionIds: string[] | null = null;
    if (!actor.isAdmin) {
      const scope = await getTeacherSectionIds(context.userId);
      scopeSectionIds = scope;
      if (scope.length === 0) return { rows: [] };
    }

    let q = supabaseAdmin.from("attendance_records")
      .select("id, attendance_date, status, remarks, student_id, section_id, class_id, marked_by, updated_at, created_at")
      .eq("school_id", actor.schoolId)
      .gte("attendance_date", data.from)
      .lte("attendance_date", data.to)
      .order("attendance_date", { ascending: false });
    if (data.sectionId) q = q.eq("section_id", data.sectionId);
    if (data.classId) q = q.eq("class_id", data.classId);
    if (data.studentId) q = q.eq("student_id", data.studentId);
    if (scopeSectionIds) q = q.in("section_id", scopeSectionIds);

    const { data: records } = await q;
    const list = records ?? [];

    const sIds = Array.from(new Set(list.map((r) => r.student_id)));
    const uIds = Array.from(new Set(list.map((r) => r.marked_by).filter(Boolean) as string[]));
    const [{ data: students }, { data: profiles }] = await Promise.all([
      sIds.length ? supabaseAdmin.from("students").select("id, full_name, attendance_id").in("id", sIds) : Promise.resolve({ data: [] }),
      uIds.length ? supabaseAdmin.from("profiles").select("id, full_name").in("id", uIds) : Promise.resolve({ data: [] }),
    ]);
    const sMap = new Map((students ?? []).map((s) => [s.id, s]));
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    const cutoffMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    return {
      rows: list.map((r) => {
        const createdMs = new Date(r.created_at).getTime();
        const withinWindow = now - createdMs <= cutoffMs;
        return {
          ...r,
          student_name: sMap.get(r.student_id)?.full_name ?? "—",
          attendance_id: sMap.get(r.student_id)?.attendance_id ?? null,
          marked_by_name: r.marked_by ? (pMap.get(r.marked_by) ?? "—") : "—",
          can_edit: actor.isAdmin || withinWindow,
        };
      }),
    };
  });

// ---------- update single record (24h window for teachers) ----------
export const updateAttendanceRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    recordId: z.string().uuid(),
    status: z.enum(["present", "absent", "late", "leave"]),
    remarks: z.string().trim().max(300).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { ok: false as const, error: "No school." };

    const { data: rec } = await supabaseAdmin.from("attendance_records")
      .select("id, section_id, school_id, created_at")
      .eq("id", data.recordId).maybeSingle();
    if (!rec || rec.school_id !== actor.schoolId) return { ok: false as const, error: "Record not found." };

    if (!actor.isAdmin) {
      const ok = await teacherCanMarkSection(context.userId, rec.section_id);
      if (!ok) return { ok: false as const, error: "Not assigned to this section." };
      const ageMs = Date.now() - new Date(rec.created_at).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        return { ok: false as const, error: "Edit window (24 hours) has expired." };
      }
    }

    const { error } = await supabaseAdmin.from("attendance_records")
      .update({
        status: data.status,
        remarks: data.remarks || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.recordId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

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

// ---------- analytics ----------
export const getStudentAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    studentId: z.string().uuid(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(i))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("attendance_records")
      .select("status")
      .eq("student_id", data.studentId)
      .gte("attendance_date", data.from)
      .lte("attendance_date", data.to);
    const list = rows ?? [];
    const total = list.length;
    const counts = { present: 0, absent: 0, late: 0, leave: 0 };
    list.forEach((r) => { counts[r.status as AttendanceStatus]++; });
    const considered = counts.present + counts.late; // late counts as attended
    const percentage = total ? Math.round((considered / total) * 1000) / 10 : 0;
    return { total, ...counts, percentage };
  });

export const getClassAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    sectionId: z.string().uuid().optional().nullable(),
    classId: z.string().uuid().optional().nullable(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { total: 0, present: 0, absent: 0, late: 0, leave: 0, percentage: 0 };
    let q = supabaseAdmin.from("attendance_records").select("status")
      .eq("school_id", actor.schoolId)
      .gte("attendance_date", data.from).lte("attendance_date", data.to);
    if (data.sectionId) q = q.eq("section_id", data.sectionId);
    if (data.classId) q = q.eq("class_id", data.classId);
    const { data: rows } = await q;
    const list = rows ?? [];
    const total = list.length;
    const counts = { present: 0, absent: 0, late: 0, leave: 0 };
    list.forEach((r) => { counts[r.status as AttendanceStatus]++; });
    const considered = counts.present + counts.late;
    const percentage = total ? Math.round((considered / total) * 1000) / 10 : 0;
    return { total, ...counts, percentage };
  });

export const getLowAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    threshold: z.number().min(0).max(100).default(75),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { rows: [] };
    let sectionFilter: string[] | null = null;
    if (!actor.isAdmin) sectionFilter = await getTeacherSectionIds(context.userId);

    let q = supabaseAdmin.from("attendance_records")
      .select("student_id, status")
      .eq("school_id", actor.schoolId)
      .gte("attendance_date", data.from).lte("attendance_date", data.to);
    if (sectionFilter) q = q.in("section_id", sectionFilter);

    const { data: rows } = await q;
    const agg = new Map<string, { total: number; attended: number }>();
    (rows ?? []).forEach((r) => {
      const v = agg.get(r.student_id) ?? { total: 0, attended: 0 };
      v.total++;
      if (r.status === "present" || r.status === "late") v.attended++;
      agg.set(r.student_id, v);
    });
    const result = Array.from(agg.entries()).map(([sid, v]) => ({
      student_id: sid, total: v.total, attended: v.attended,
      percentage: v.total ? Math.round((v.attended / v.total) * 1000) / 10 : 0,
    })).filter((r) => r.percentage < data.threshold);
    if (result.length === 0) return { rows: [] };
    const { data: students } = await supabaseAdmin.from("students")
      .select("id, full_name, attendance_id, class_id, section_id")
      .in("id", result.map((r) => r.student_id));
    const sMap = new Map((students ?? []).map((s) => [s.id, s]));
    return {
      rows: result.map((r) => ({
        ...r,
        student_name: sMap.get(r.student_id)?.full_name ?? "—",
        attendance_id: sMap.get(r.student_id)?.attendance_id ?? null,
      })).sort((a, b) => a.percentage - b.percentage),
    };
  });

// ---------- parent: my children attendance ----------
export const getMyChildrenAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: parent } = await supabaseAdmin.from("parents")
      .select("id").eq("user_id", context.userId).maybeSingle();
    if (!parent) return { children: [] };
    const { data: links } = await supabaseAdmin.from("parent_students")
      .select("student_id").eq("parent_id", parent.id);
    const sIds = (links ?? []).map((l) => l.student_id);
    if (sIds.length === 0) return { children: [] };
    const { data: students } = await supabaseAdmin.from("students")
      .select("id, full_name, attendance_id, photo_url").in("id", sIds);
    const { data: records } = await supabaseAdmin.from("attendance_records")
      .select("student_id, status, attendance_date, remarks")
      .in("student_id", sIds)
      .gte("attendance_date", data.from).lte("attendance_date", data.to)
      .order("attendance_date", { ascending: false });

    const children = (students ?? []).map((s) => {
      const recs = (records ?? []).filter((r) => r.student_id === s.id);
      const counts = { present: 0, absent: 0, late: 0, leave: 0 };
      recs.forEach((r) => { counts[r.status as AttendanceStatus]++; });
      const total = recs.length;
      const attended = counts.present + counts.late;
      const percentage = total ? Math.round((attended / total) * 1000) / 10 : 0;
      return { ...s, total, ...counts, percentage, history: recs };
    });
    return { children };
  });

// ---------- settings ----------
export const getAttendanceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId) return { threshold: 75 };
    const { data } = await supabaseAdmin.from("attendance_settings")
      .select("low_attendance_threshold").eq("school_id", actor.schoolId).maybeSingle();
    return { threshold: data?.low_attendance_threshold ? Number(data.low_attendance_threshold) : 75 };
  });

export const updateAttendanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ threshold: z.number().min(0).max(100) }).parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    if (!actor.schoolId || !actor.isAdmin) return { ok: false as const, error: "Admin only." };
    await supabaseAdmin.from("attendance_settings").upsert(
      { school_id: actor.schoolId, low_attendance_threshold: data.threshold },
      { onConflict: "school_id" },
    );
    return { ok: true as const };
  });
