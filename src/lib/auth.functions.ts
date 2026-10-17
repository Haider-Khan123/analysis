import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/postgres/auth-middleware";

const credentials = z.object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(200) });

export const signInWithPasswordFn = createServerFn({ method: "POST" })
  .inputValidator(credentials)
  .handler(async ({ data }) => {
    const { auth } = await import("@/integrations/postgres/auth.server");
    const res = await auth.signInWithPassword(data.email, data.password);
    return { session: res.data.session, error: res.error?.message ?? null };
  });

export const signUpFn = createServerFn({ method: "POST" })
  .inputValidator(credentials.extend({ fullName: z.string().trim().max(200).optional() }))
  .handler(async ({ data }) => {
    const { auth } = await import("@/integrations/postgres/auth.server");
    const res = await auth.signUp(data.email, data.password, data.fullName ? { full_name: data.fullName } : {});
    return { session: res.data.session, error: res.error?.message ?? null };
  });

export const exchangeRecoveryTokenFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(10).max(200) }))
  .handler(async ({ data }) => {
    const { auth } = await import("@/integrations/postgres/auth.server");
    const res = await auth.exchangeRecoveryToken(data.token);
    return { session: res.data.session, error: res.error?.message ?? null };
  });

export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().trim().email(), redirectTo: z.string().url().optional() }))
  .handler(async ({ data }) => {
    const { auth } = await import("@/integrations/postgres/auth.server");
    await auth.resetPasswordForEmail(data.email, { redirectTo: data.redirectTo });
    return { error: null };
  });

export const updatePasswordFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(z.object({ password: z.string().min(6).max(200) }))
  .handler(async ({ data, context }) => {
    const { auth } = await import("@/integrations/postgres/auth.server");
    const res = await auth.updatePassword(context.userId, data.password);
    const user = await auth.getUser(context.userId);
    return { user, error: res.error?.message ?? null };
  });

/** The signed-in user's profile and roles (was a direct browser query under RLS). */
export const getMyProfileAndRoles = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { db } = await import("@/integrations/postgres/client.server");
    const [{ data: profile }, { data: roles }] = await Promise.all([
      db.from("profiles").select("id, full_name, email, school_id").eq("id", context.userId).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    return {
      profile: (profile ?? null) as { id: string; full_name: string; email: string; school_id: string | null } | null,
      roles: ((roles ?? []) as { role: string }[]).map((r) => r.role),
    };
  });
