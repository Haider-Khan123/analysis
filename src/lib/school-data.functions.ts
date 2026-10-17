// Server functions for the reads/writes that pages used to run straight from the
// browser under Supabase row-level security. The RLS rules are enforced here:
// any member of an (unsuspended) school can read its rows; only its admins can write.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/integrations/postgres/auth-middleware";

const TABLES = {
  classes: { order: "name", columns: ["id", "name", "grade_level", "created_at"] },
  sections: { order: "name", columns: ["id", "name", "class_id", "teacher_id", "created_at"] },
  students: {
    order: "full_name",
    columns: ["id", "full_name", "first_name", "last_name", "attendance_id", "admission_number", "class_id", "section_id", "status", "photo_url"],
  },
  parents: {
    order: "full_name",
    columns: ["id", "parent_id", "full_name", "first_name", "last_name", "email", "phone", "cnic", "photo_url", "status", "user_id"],
  },
  teachers: {
    order: "full_name",
    columns: ["id", "full_name", "first_name", "last_name", "email", "phone", "subject", "designation", "department", "status", "employee_id", "photo_url", "user_id"],
  },
} as const;
type Table = keyof typeof TABLES;

/** The caller's active (not suspended) school, mirroring current_school_id(). */
async function currentSchool(userId: string) {
  const { sql } = await import("@/integrations/postgres/pool.server");
  const rows = await sql<{ id: string }>(
    `SELECT s.id FROM profiles p JOIN schools s ON s.id = p.school_id WHERE p.id = $1 AND s.is_suspended = FALSE`,
    [userId],
  );
  return rows[0]?.id ?? null;
}

async function requireSchoolAdmin(userId: string) {
  const schoolId = await currentSchool(userId);
  if (!schoolId) throw new Error("Unauthorized: no active institute.");
  const { db } = await import("@/integrations/postgres/client.server");
  const { data } = await db.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").limit(1);
  if (!data?.length) throw new Error("Unauthorized: admin access required.");
  return schoolId;
}

export const listSchoolRows = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator(z.object({ table: z.enum(Object.keys(TABLES) as [Table, ...Table[]]), columns: z.string().max(500) }))
  .handler(async ({ data, context }) => {
    const spec = TABLES[data.table];
    const cols = data.columns.split(",").map((c) => c.trim()).filter(Boolean);
    for (const c of cols) {
      if (!(spec.columns as readonly string[]).includes(c)) throw new Error(`Column not allowed: ${c}`);
    }
    const schoolId = await currentSchool(context.userId);
    if (!schoolId) return [];
    const { db } = await import("@/integrations/postgres/client.server");
    const { data: rows, error } = await db.from(data.table).select(cols.join(", ")).eq("school_id", schoolId).order(spec.order);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows as any[];
  });

export const createClass = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(z.object({ name: z.string().trim().min(1).max(100), grade_level: z.string().trim().max(100).nullable().optional() }))
  .handler(async ({ data, context }) => {
    const schoolId = await requireSchoolAdmin(context.userId);
    const { db } = await import("@/integrations/postgres/client.server");
    const { error } = await db.from("classes").insert({ name: data.name, grade_level: data.grade_level ?? null, school_id: schoolId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createSection = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(z.object({ name: z.string().trim().min(1).max(100), class_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const schoolId = await requireSchoolAdmin(context.userId);
    const { db } = await import("@/integrations/postgres/client.server");
    const { data: cls } = await db.from("classes").select("id").eq("id", data.class_id).eq("school_id", schoolId).maybeSingle();
    if (!cls) throw new Error("Class not found.");
    const { error } = await db.from("sections").insert({ name: data.name, class_id: data.class_id, school_id: schoolId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSchoolRow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(z.object({ table: z.enum(["classes", "sections", "teachers"]), id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const schoolId = await requireSchoolAdmin(context.userId);
    const { db } = await import("@/integrations/postgres/client.server");
    const { error } = await db.from(data.table).delete().eq("id", data.id).eq("school_id", schoolId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
