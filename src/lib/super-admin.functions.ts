import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/integrations/postgres/auth-middleware";

// Seeded from the environment (see .env.example); the bootstrap is skipped when unset.
const superAdminConfig = () => ({
  email: (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase(),
  password: process.env.SUPER_ADMIN_PASSWORD ?? "",
  name: process.env.SUPER_ADMIN_NAME ?? "Super Admin",
});

/**
 * Idempotent bootstrap. Safe to call on every app load.
 * Creates the super-admin auth user and role assignment if missing.
 */
export const bootstrapSuperAdmin = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true; created: boolean }> => {
    const { db } = await import("@/integrations/postgres/client.server");

    // 1) Check if any super_admin role already exists
    const { data: existingRole } = await db
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin")
      .limit(1)
      .maybeSingle();
    if (existingRole?.user_id) return { ok: true, created: false };
    const cfg = superAdminConfig();
    if (!cfg.email || !cfg.password) return { ok: true, created: false };

    // 2) Find or create the auth user
    let userId: string | null = null;
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = list?.users?.find((u) => u.email?.toLowerCase() === cfg.email);
    if (found) {
      userId = found.id;
    } else {
      const { data: created, error } = await db.auth.admin.createUser({
        email: cfg.email,
        password: cfg.password,
        email_confirm: true,
        user_metadata: { full_name: cfg.name },
      });
      if (error || !created.user) throw new Error(error?.message ?? "Failed to seed super admin");
      userId = created.user.id;
    }

    // 3) Ensure profile row
    await db
      .from("profiles")
      .upsert({ id: userId, email: cfg.email, full_name: cfg.name, school_id: null });

    // 4) Assign super_admin role
    await db
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
  const { db } = await import("@/integrations/postgres/client.server");
  const { data } = await db
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "super_admin" as never)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: super admin only");
}

export const listSchoolAdmins = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ admins: SchoolAdminRow[] }> => {
    await assertSuperAdmin(context.userId);
    const { db } = await import("@/integrations/postgres/client.server");

    const { data: roles } = await db
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = Array.from(new Set((roles ?? []).map((r) => r.user_id).filter(Boolean))) as string[];
    if (adminIds.length === 0) return { admins: [] };

    const { data: profiles } = await db
      .from("profiles")
      .select("id, full_name, email, school_id")
      .in("id", adminIds);

    const schoolIds = Array.from(
      new Set((profiles ?? []).map((p) => p.school_id).filter(Boolean)),
    ) as string[];
    const { data: schools } = schoolIds.length
      ? await db.from("schools").select("id, name, is_suspended").in("id", schoolIds)
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
  .middleware([requireAuth])
  .inputValidator((input: { schoolId: string; suspended: boolean }) => {
    if (!input?.schoolId || typeof input.suspended !== "boolean") {
      throw new Error("Invalid input");
    }
    return input;
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertSuperAdmin(context.userId);
    const { db } = await import("@/integrations/postgres/client.server");

    const { error } = await db
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
      const { data: members } = await db
        .from("profiles")
        .select("id")
        .eq("school_id", data.schoolId);
      for (const m of members ?? []) {
        try {
          await db.auth.admin.signOut(m.id);
        } catch {
          /* best-effort */
        }
      }
    }
    return { ok: true };
  });
