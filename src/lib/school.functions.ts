import { branchError, phoneError } from "./validators";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/postgres/auth-middleware";
import { db } from "@/integrations/postgres/client.server";

/**
 * Bootstrap a new school for the currently authenticated admin user.
 * Creates: school -> profile.school_id -> user_roles(admin).
 */
export const createSchoolForAdmin = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input) =>
    z
      .object({
        schoolName: z.string().trim().min(2).max(120),
        address: z.string().trim().max(255).optional().nullable(),
        phone: z.string().trim().max(25).refine((v) => !v || !phoneError(v), { message: "Please enter a valid phone number (max 15 digits)." }).optional().nullable(),
        branch: z.string().trim().max(20).refine((v) => !v || !branchError(v), { message: "Branch Code can only contain up to 20 letters and numbers." }).optional().nullable(),
        logoDataUrl: z
          .string()
          .max(800_000)
          .regex(/^data:image\/[a-zA-Z+]+;base64,/, "Invalid image data")
          .optional()
          .nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined) ?? "";

    const { data: existingProfile } = await db
      .from("profiles")
      .select("school_id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile?.school_id) {
      return { ok: false as const, error: "You already belong to an institute." };
    }

    const { data: school, error: schoolError } = await db
      .from("schools")
      .insert({
        name: data.schoolName,
        address: data.address ?? null,
        phone: data.phone ?? null,
        branch: data.branch ?? null,
        email,
        logo_url: data.logoDataUrl ?? null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (schoolError || !school) {
      return { ok: false as const, error: schoolError?.message ?? "Failed to create institute" };
    }

    await db.from("profiles").update({ school_id: school.id }).eq("id", userId);

    await db.from("user_roles").upsert(
      { user_id: userId, role: "admin", school_id: school.id },
      { onConflict: "user_id,role,school_id" },
    );

    return { ok: true as const, schoolId: school.id };
  });

/** Fetch the school profile for the currently authenticated user (via admin client to avoid RLS edge-cases). */
export const getMySchool = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: profile } = await db
      .from("profiles")
      .select("school_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.school_id) return { school: null as null | {
      id: string; name: string; branch: string | null; phone: string | null;
      address: string | null; email: string | null; logo_url: string | null;
    } };

    const { data: school } = await db
      .from("schools")
      .select("id, name, branch, phone, address, email, logo_url")
      .eq("id", profile.school_id)
      .maybeSingle();

    if (!school) {
      // Stale link — clear it so the create form shows.
      await db.from("profiles").update({ school_id: null }).eq("id", userId);
      return { school: null };
    }
    return { school };
  });

/** Update the current user's school (admin only). */
export const updateMySchool = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input) =>
    z.object({
      name: z.string().trim().min(2).max(120),
      branch: z.string().trim().max(20).refine((v) => !v || !branchError(v), { message: "Branch Code can only contain up to 20 letters and numbers." }).nullable(),
      phone: z.string().trim().max(25).refine((v) => !v || !phoneError(v), { message: "Please enter a valid phone number (max 15 digits)." }).nullable(),
      logoDataUrl: z.string().max(800_000).nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: profile } = await db
      .from("profiles").select("school_id").eq("id", userId).maybeSingle();
    if (!profile?.school_id) return { ok: false as const, error: "No institute found." };

    const { data: adminRole } = await db
      .from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!adminRole) return { ok: false as const, error: "Only admins can edit." };

    const { error } = await db
      .from("schools")
      .update({
        name: data.name,
        branch: data.branch,
        phone: data.phone,
        logo_url: data.logoDataUrl,
      })
      .eq("id", profile.school_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Delete the current user's school (admin only). */
export const deleteMySchool = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: profile } = await db
      .from("profiles").select("school_id").eq("id", userId).maybeSingle();
    if (!profile?.school_id) return { ok: false as const, error: "No institute." };

    const { data: adminRole } = await db
      .from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!adminRole) return { ok: false as const, error: "Only admins can delete." };

    const schoolId = profile.school_id;
    await db.from("profiles").update({ school_id: null }).eq("school_id", schoolId);
    await db.from("user_roles").delete().eq("school_id", schoolId);
    const { error } = await db.from("schools").delete().eq("id", schoolId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Dashboard counts for the current school. */
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: profile } = await db
      .from("profiles")
      .select("school_id, full_name")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.school_id) {
      return { schoolId: null, counts: { institute: 0, students: 0, teachers: 0, classes: 0, sections: 0, parents: 0 }, schoolName: null };
    }

    const schoolId = profile.school_id;
    const [{ data: school }, students, teachers, classes, sections, parents] = await Promise.all([
      db.from("schools").select("name").eq("id", schoolId).maybeSingle(),
      db.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      db.from("teachers").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      db.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      db.from("sections").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
      db.from("parents").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    ]);

    return {
      schoolId,
      schoolName: school?.name ?? null,
      counts: {
        institute: 1,
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        classes: classes.count ?? 0,
        sections: sections.count ?? 0,
        parents: parents.count ?? 0,
      },
    };
  });



/**
 * Admin-only: invite a teacher or parent to create a login.
 * - Sends Supabase invite email (delivers a recovery link to /reset-password).
 * - Creates profile row scoped to this school.
 * - Assigns the corresponding role.
 * - Links the new auth user back to the teacher/parent row.
 */
export const inviteUserForRow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input) =>
    z
      .object({
        kind: z.enum(["teacher", "parent"]),
        rowId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Verify caller is an admin of a school
    const { data: callerProfile } = await db
      .from("profiles")
      .select("school_id")
      .eq("id", userId)
      .maybeSingle();
    const schoolId = callerProfile?.school_id;
    if (!schoolId) return { ok: false as const, error: "No institute on your profile." };

    const { data: adminRole } = await db
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) return { ok: false as const, error: "Only admins can send invites." };

    const table = data.kind === "teacher" ? "teachers" : "parents";
    const { data: row, error: rowErr } = await db
      .from(table)
      .select("id, email, full_name, user_id, school_id")
      .eq("id", data.rowId)
      .maybeSingle();
    if (rowErr || !row) return { ok: false as const, error: "Record not found." };
    if (row.school_id !== schoolId) return { ok: false as const, error: "Wrong institute." };
    if (row.user_id) return { ok: false as const, error: "This person already has a login." };
    if (!row.email) return { ok: false as const, error: "Add an email first." };

    const redirectTo = `${process.env.PUBLIC_APP_URL ?? ""}/reset-password`;

    // Try invite; if user already exists, fall back to password reset email.
    let newUserId: string | null = null;
    const inviteRes = await db.auth.admin.inviteUserByEmail(row.email, {
      data: { full_name: row.full_name },
      redirectTo: redirectTo || undefined,
    });

    if (inviteRes.error) {
      // User may already exist — look them up and send a password recovery link.
      const { data: list } = await db.auth.admin.listUsers();
      const existing = list?.users.find(
        (u) => u.email?.toLowerCase() === row.email!.toLowerCase(),
      );
      if (!existing) {
        return { ok: false as const, error: inviteRes.error.message };
      }
      newUserId = existing.id;
      await db.auth.resetPasswordForEmail(row.email, {
        redirectTo: redirectTo || undefined,
      });
    } else {
      newUserId = inviteRes.data.user?.id ?? null;
    }

    if (!newUserId) return { ok: false as const, error: "Could not create user." };

    // Ensure profile exists & is scoped to this school.
    await db.from("profiles").upsert(
      {
        id: newUserId,
        full_name: row.full_name,
        email: row.email,
        school_id: schoolId,
      },
      { onConflict: "id" },
    );

    // Assign role.
    await db.from("user_roles").upsert(
      { user_id: newUserId, role: data.kind, school_id: schoolId },
      { onConflict: "user_id,role,school_id" },
    );

    // Link back to the teacher/parent row.
    await db.from(table).update({ user_id: newUserId }).eq("id", row.id);

    return { ok: true as const };
  });
