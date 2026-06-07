import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Returns data scoped to the currently signed-in teacher:
 * - classes they teach (via teacher_classes or class_teachers)
 * - sections they're assigned to (via section_teachers or class_teachers)
 * - students enrolled in those sections
 * - parents linked to those students
 *
 * Plus counts for the teacher dashboard.
 */
export const getTeacherScopedData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const empty = {
      teacherId: null as string | null,
      schoolId: null as string | null,
      classes: [] as Array<{ id: string; name: string; grade_level: string | null }>,
      sections: [] as Array<{ id: string; name: string; class_id: string }>,
      students: [] as Array<{
        id: string; full_name: string; attendance_id: string | null;
        admission_number: string | null; class_id: string | null;
        section_id: string | null; status: string | null; photo_url: string | null;
      }>,
      parents: [] as Array<{
        id: string; parent_id: string | null; full_name: string; first_name: string | null;
        last_name: string | null; email: string | null; phone: string | null;
        cnic: string | null; photo_url: string | null; status: string | null; user_id: string | null;
      }>,
      counts: { classes: 0, sections: 0, students: 0, parents: 0 },
    };

    const { data: teacher } = await supabaseAdmin
      .from("teachers")
      .select("id, school_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!teacher) return empty;

    const [tc, ct, st] = await Promise.all([
      supabaseAdmin.from("teacher_classes").select("class_id").eq("teacher_id", teacher.id),
      supabaseAdmin.from("class_teachers").select("class_id, section_id").eq("teacher_id", teacher.id),
      supabaseAdmin.from("section_teachers").select("section_id").eq("teacher_id", teacher.id),
    ]);

    const classIds = new Set<string>();
    (tc.data ?? []).forEach((r) => classIds.add(r.class_id));
    (ct.data ?? []).forEach((r) => classIds.add(r.class_id));

    const sectionIds = new Set<string>();
    (st.data ?? []).forEach((r) => sectionIds.add(r.section_id));
    (ct.data ?? []).forEach((r) => sectionIds.add(r.section_id));

    // Also pull sections that belong to teacher's classes (for the Classes page grouping).
    const classIdArr = Array.from(classIds);
    const { data: sectionsByClass } = classIdArr.length
      ? await supabaseAdmin.from("sections")
          .select("id, name, class_id")
          .in("class_id", classIdArr)
          .eq("school_id", teacher.school_id)
      : { data: [] };

    (sectionsByClass ?? []).forEach((s) => sectionIds.add(s.id));

    const sectionIdArr = Array.from(sectionIds);

    const [classesRes, sectionsRes, studentsRes] = await Promise.all([
      classIdArr.length
        ? supabaseAdmin.from("classes")
            .select("id, name, grade_level")
            .in("id", classIdArr)
            .eq("school_id", teacher.school_id)
            .order("name")
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; grade_level: string | null }> }),
      sectionIdArr.length
        ? supabaseAdmin.from("sections")
            .select("id, name, class_id")
            .in("id", sectionIdArr)
            .eq("school_id", teacher.school_id)
            .order("name")
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; class_id: string }> }),
      sectionIdArr.length
        ? supabaseAdmin.from("students")
            .select("id, full_name, attendance_id, admission_number, class_id, section_id, status, photo_url")
            .in("section_id", sectionIdArr)
            .eq("school_id", teacher.school_id)
            .order("full_name")
        : Promise.resolve({ data: [] as Array<{
            id: string; full_name: string; attendance_id: string | null;
            admission_number: string | null; class_id: string | null;
            section_id: string | null; status: string | null; photo_url: string | null;
          }> }),
    ]);

    const students = studentsRes.data ?? [];
    const studentIds = students.map((s) => s.id);

    let parents: typeof empty.parents = [];
    if (studentIds.length) {
      const { data: links } = await supabaseAdmin
        .from("parent_students")
        .select("parent_id")
        .in("student_id", studentIds);
      const parentIds = Array.from(new Set((links ?? []).map((l) => l.parent_id)));
      if (parentIds.length) {
        const { data: pRows } = await supabaseAdmin
          .from("parents")
          .select("id, parent_id, full_name, first_name, last_name, email, phone, cnic, photo_url, status, user_id")
          .in("id", parentIds)
          .eq("school_id", teacher.school_id)
          .order("full_name");
        parents = pRows ?? [];
      }
    }

    return {
      teacherId: teacher.id,
      schoolId: teacher.school_id,
      classes: classesRes.data ?? [],
      sections: sectionsRes.data ?? [],
      students,
      parents,
      counts: {
        classes: (classesRes.data ?? []).length,
        sections: (sectionsRes.data ?? []).length,
        students: students.length,
        parents: parents.length,
      },
    };
  });
