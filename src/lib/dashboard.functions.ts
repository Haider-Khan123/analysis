import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DateInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function getActor(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("school_id").eq("id", userId).maybeSingle();
  const { data: rolesRows } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
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
    const { data: extra } = await supabaseAdmin
      .from("sections").select("id").in("class_id", Array.from(classIds));
    (extra ?? []).forEach((s) => sectionIds.add(s.id));
  }
  return Array.from(sectionIds);
}

export const getDashboardCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DateInput.parse(i))
  .handler(async ({ data, context }) => {
    const actor = await getActor(context.userId);
    const zero = { attendance: 0, homework: 0, progress: 0, notifications: 0 };
    if (!actor.schoolId && !actor.isParent) return zero;

    // Notifications scoped to the user (any role)
    const { count: notifCount } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", `${data.from}T00:00:00Z`)
      .lte("created_at", `${data.to}T23:59:59Z`);

    // Parent scope
    if (actor.isParent && !actor.isAdmin && !actor.isTeacher) {
      const { data: parent } = await supabaseAdmin
        .from("parents").select("id").eq("user_id", context.userId).maybeSingle();
      if (!parent) return { ...zero, notifications: notifCount ?? 0 };
      const { data: links } = await supabaseAdmin
        .from("parent_students").select("student_id").eq("parent_id", parent.id);
      const studentIds = (links ?? []).map((l) => l.student_id);
      if (!studentIds.length) return { ...zero, notifications: notifCount ?? 0 };

      const { data: students } = await supabaseAdmin
        .from("students").select("id, class_id, section_id").in("id", studentIds);
      const classIds = Array.from(new Set((students ?? []).map((s) => s.class_id).filter(Boolean)));
      const sectionIds = Array.from(new Set((students ?? []).map((s) => s.section_id).filter(Boolean)));

      const [attRes, progRes, hwRes] = await Promise.all([
        supabaseAdmin.from("attendance_records").select("id", { count: "exact", head: true })
          .in("student_id", studentIds).gte("attendance_date", data.from).lte("attendance_date", data.to),
        supabaseAdmin.from("student_progress").select("id", { count: "exact", head: true })
          .in("student_id", studentIds).gte("record_date", data.from).lte("record_date", data.to),
        // Homework relevant to child's class/section
        (async () => {
          const ors: string[] = [];
          if (sectionIds.length) ors.push(`section_id.in.(${sectionIds.join(",")})`);
          if (classIds.length) ors.push(`class_id.in.(${classIds.join(",")})`);
          let q = supabaseAdmin.from("homework").select("id", { count: "exact", head: true })
            .gte("assigned_date", data.from).lte("assigned_date", data.to);
          if (ors.length) q = q.or(ors.join(","));
          return q;
        })(),
      ]);
      return {
        attendance: attRes.count ?? 0,
        progress: progRes.count ?? 0,
        homework: hwRes.count ?? 0,
        notifications: notifCount ?? 0,
      };
    }

    // Teacher scope
    if (actor.isTeacher && !actor.isAdmin) {
      const sectionIds = await getTeacherSectionIds(context.userId);
      if (!sectionIds.length) return { ...zero, notifications: notifCount ?? 0 };
      const [attRes, progRes, hwRes] = await Promise.all([
        supabaseAdmin.from("attendance_records").select("id", { count: "exact", head: true })
          .eq("school_id", actor.schoolId!).in("section_id", sectionIds)
          .gte("attendance_date", data.from).lte("attendance_date", data.to),
        supabaseAdmin.from("student_progress").select("id", { count: "exact", head: true })
          .eq("school_id", actor.schoolId!).in("section_id", sectionIds)
          .gte("record_date", data.from).lte("record_date", data.to),
        supabaseAdmin.from("homework").select("id", { count: "exact", head: true })
          .eq("school_id", actor.schoolId!).eq("created_by", context.userId)
          .gte("assigned_date", data.from).lte("assigned_date", data.to),
      ]);
      return {
        attendance: attRes.count ?? 0,
        progress: progRes.count ?? 0,
        homework: hwRes.count ?? 0,
        notifications: notifCount ?? 0,
      };
    }

    // Admin scope (school-wide)
    const [attRes, progRes, hwRes] = await Promise.all([
      supabaseAdmin.from("attendance_records").select("id", { count: "exact", head: true })
        .eq("school_id", actor.schoolId!)
        .gte("attendance_date", data.from).lte("attendance_date", data.to),
      supabaseAdmin.from("student_progress").select("id", { count: "exact", head: true })
        .eq("school_id", actor.schoolId!)
        .gte("record_date", data.from).lte("record_date", data.to),
      supabaseAdmin.from("homework").select("id", { count: "exact", head: true })
        .eq("school_id", actor.schoolId!)
        .gte("assigned_date", data.from).lte("assigned_date", data.to),
    ]);
    return {
      attendance: attRes.count ?? 0,
      progress: progRes.count ?? 0,
      homework: hwRes.count ?? 0,
      notifications: notifCount ?? 0,
    };
  });
