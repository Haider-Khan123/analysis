import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AppUserRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  roles: string[];
  source: "admin" | "teacher" | "parent" | "student" | "other";
  source_label: string;
  status: string | null;
  created_at: string;
};

async function assertAdminSchool(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("school_id").eq("id", userId).maybeSingle();
  const schoolId = profile?.school_id;
  if (!schoolId) return { error: "No institute on your profile." as const };
  const { data: adminRole } = await supabaseAdmin
    .from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!adminRole) return { error: "Only admins can perform this action." as const };
  return { schoolId };
}

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AppUserRow[]; error?: string }> => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { users: [], error: guard.error };
    const { schoolId } = guard;

    const [{ data: profiles }, { data: roles }, { data: teachers }, { data: parents }, { data: students }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email, phone, created_at").eq("school_id", schoolId),
      supabaseAdmin.from("user_roles").select("user_id, role, school_id"),
      supabaseAdmin.from("teachers").select("user_id, full_name, email, phone, status, created_at, designation").eq("school_id", schoolId),
      supabaseAdmin.from("parents").select("user_id, full_name, email, phone, status, created_at").eq("school_id", schoolId),
      supabaseAdmin.from("students").select("id, full_name, status, created_at").eq("school_id", schoolId),
    ]);

    const roleByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      if (!r.user_id) return;
      const arr = roleByUser.get(r.user_id) ?? [];
      arr.push(r.role as string);
      roleByUser.set(r.user_id, arr);
    });

    const teacherByUser = new Map<string, typeof teachers extends Array<infer T> | null ? T : never>();
    (teachers ?? []).forEach((t) => { if (t.user_id) teacherByUser.set(t.user_id, t); });
    const parentByUser = new Map<string, typeof parents extends Array<infer T> | null ? T : never>();
    (parents ?? []).forEach((p) => { if (p.user_id) parentByUser.set(p.user_id, p); });

    const users: AppUserRow[] = [];
    const seen = new Set<string>();

    (profiles ?? []).forEach((p) => {
      seen.add(p.id);
      const rs = roleByUser.get(p.id) ?? [];
      const t = teacherByUser.get(p.id);
      const par = parentByUser.get(p.id);
      let source: AppUserRow["source"] = "other";
      let source_label = "Profile";
      let status: string | null = null;
      if (rs.includes("admin")) { source = "admin"; source_label = "School Administrator"; }
      if (t) { source = "teacher"; source_label = `Teacher${t.designation ? ` · ${t.designation}` : ""}`; status = t.status ?? null; }
      else if (par) { source = "parent"; source_label = "Parent / Guardian"; status = par.status ?? null; }
      users.push({
        id: p.id,
        full_name: p.full_name ?? null,
        email: p.email,
        phone: (p as { phone?: string | null }).phone ?? t?.phone ?? par?.phone ?? null,
        roles: rs,
        source,
        source_label,
        status,
        created_at: p.created_at as string,
      });
    });

    // Teachers / parents without auth user (no login yet) — still surface them
    (teachers ?? []).forEach((t) => {
      if (t.user_id && seen.has(t.user_id)) return;
      users.push({
        id: `teacher:${t.user_id ?? t.email ?? Math.random()}`,
        full_name: t.full_name,
        email: t.email ?? "—",
        phone: t.phone ?? null,
        roles: [],
        source: "teacher",
        source_label: `Teacher${t.designation ? ` · ${t.designation}` : ""} (no login)`,
        status: t.status ?? null,
        created_at: t.created_at as string,
      });
    });
    (parents ?? []).forEach((p) => {
      if (p.user_id && seen.has(p.user_id)) return;
      users.push({
        id: `parent:${p.user_id ?? p.email ?? Math.random()}`,
        full_name: p.full_name,
        email: p.email ?? "—",
        phone: p.phone ?? null,
        roles: [],
        source: "parent",
        source_label: "Parent / Guardian (no login)",
        status: p.status ?? null,
        created_at: p.created_at as string,
      });
    });
    (students ?? []).forEach((s) => {
      users.push({
        id: `student:${s.id}`,
        full_name: s.full_name,
        email: "—",
        phone: null,
        roles: [],
        source: "student",
        source_label: "Student",
        status: s.status ?? null,
        created_at: s.created_at as string,
      });
    });

    users.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { users };
  });
