import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Bootstrap a new school for the currently authenticated admin user.
 * Creates: school -> profile.school_id -> user_roles(admin).
 */
export const createSchoolForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        schoolName: z.string().trim().min(2).max(120),
        address: z.string().trim().max(255).optional().nullable(),
        phone: z.string().trim().max(40).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined) ?? "";

    // Reject if user already has a school
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile?.school_id) {
      return { ok: false as const, error: "You already belong to a school." };
    }

    const { data: school, error: schoolError } = await supabaseAdmin
      .from("schools")
      .insert({
        name: data.schoolName,
        address: data.address ?? null,
        phone: data.phone ?? null,
        email,
        created_by: userId,
      })
      .select("id")
      .single();

    if (schoolError || !school) {
      return { ok: false as const, error: schoolError?.message ?? "Failed to create school" };
    }

    await supabaseAdmin.from("profiles").update({ school_id: school.id }).eq("id", userId);

    await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role: "admin", school_id: school.id },
      { onConflict: "user_id,role,school_id" },
    );

    return { ok: true as const, schoolId: school.id };
  });

/** Dashboard counts for the current school. */
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id, full_name")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.school_id) {
      return { schoolId: null, counts: { students: 0, teachers: 0, classes: 0, parents: 0 }, schoolName: null };
    }

    const schoolId = profile.school_id;
    const [{ data: school }, students, teachers, classes, parents] = await Promise.all([
      supabase.from("schools").select("name").eq("id", schoolId).maybeSingle(),
      supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      supabase.from("teachers").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      supabase.from("parents").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    ]);

    return {
      schoolId,
      schoolName: school?.name ?? null,
      counts: {
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        classes: classes.count ?? 0,
        parents: parents.count ?? 0,
      },
    };
  });
