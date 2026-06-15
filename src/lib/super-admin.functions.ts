import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SUPER_ADMIN_EMAIL = "haider@analysis.edu.pk";
const SUPER_ADMIN_PASSWORD = "HAIDERkhan30";
const SUPER_ADMIN_NAME = "Haider Khan";

/**
 * Idempotent bootstrap. Safe to call on every app load.
 * Creates the super-admin auth user and role assignment if missing.
 */
export const bootstrapSuperAdmin = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true; created: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Check if any super_admin role already exists
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin")
      .limit(1)
      .maybeSingle();
    if (existingRole?.user_id) return { ok: true, created: false };

    // 2) Find or create the auth user
    let userId: string | null = null;
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = list?.users?.find((u) => u.email?.toLowerCase() === SUPER_ADMIN_EMAIL);
    if (found) {
      userId = found.id;
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: SUPER_ADMIN_NAME },
      });
      if (error || !created.user) throw new Error(error?.message ?? "Failed to seed super admin");
      userId = created.user.id;
    }

    // 3) Ensure profile row
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, email: SUPER_ADMIN_EMAIL, full_name: SUPER_ADMIN_NAME, school_id: null });

    // 4) Assign super_admin role
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "super_admin" as never })
      .select()
      .single();

    return { ok: true, created: true };
  },
);

export type SchoolAdminRow = {
  user_id: string;
  full_name: string;
  email: string;
  school_id: string | null;
  school_name: string | null;
  is_suspended: boolean;
};

async function assertSuperAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "super_admin" as never)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: super admin only");
}

export const listSchoolAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ admins: SchoolAdminRow[] }> => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = Array.from(new Set((roles ?? []).map((r) => r.user_id).filter(Boolean))) as string[];
    if (adminIds.length === 0) return { admins: [] };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, school_id")
      .in("id", adminIds);

    const schoolIds = Array.from(
      new Set((profiles ?? []).map((p) => p.school_id).filter(Boolean)),
    ) as string[];
    const { data: schools } = schoolIds.length
      ? await supabaseAdmin.from("schools").select("id, name, is_suspended").in("id", schoolIds)
      : { data: [] as { id: string; name: string; is_suspended: boolean }[] };

    const byId = new Map((schools ?? []).map((s) => [s.id, s]));
    const admins: SchoolAdminRow[] = (profiles ?? []).map((p) => {
      const s = p.school_id ? byId.get(p.school_id) : undefined;
      return {
        user_id: p.id,
        full_name: p.full_name ?? "—",
        email: p.email,
        school_id: p.school_id ?? null,
        school_name: s?.name ?? null,
        is_suspended: s?.is_suspended ?? false,
      };
    });
    admins.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return { admins };
  });

export const setSchoolSuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { schoolId: string; suspended: boolean }) => {
    if (!input?.schoolId || typeof input.suspended !== "boolean") {
      throw new Error("Invalid input");
    }
    return input;
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("schools")
      .update({
        is_suspended: data.suspended,
        suspended_at: data.suspended ? new Date().toISOString() : null,
        suspended_by: data.suspended ? context.userId : null,
      })
      .eq("id", data.schoolId);
    if (error) throw new Error(error.message);

    // Invalidate sessions of users in this school so blocked admin can't keep using the app
    if (data.suspended) {
      const { data: members } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("school_id", data.schoolId);
      for (const m of members ?? []) {
        try {
          await supabaseAdmin.auth.admin.signOut(m.id);
        } catch {
          /* best-effort */
        }
      }
    }
    return { ok: true };
  });
