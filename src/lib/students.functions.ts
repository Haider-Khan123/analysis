import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdminSchool(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("school_id, full_name").eq("id", userId).maybeSingle();
  const schoolId = profile?.school_id;
  if (!schoolId) return { error: "No institute on your profile." as const };
  const { data: adminRole } = await supabaseAdmin
    .from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!adminRole) return { error: "Only admins can perform this action." as const };
  return { schoolId, actorName: profile?.full_name ?? null };
}

async function logAudit(schoolId: string, actorId: string, actorName: string | null,
  entity: string, entityId: string, action: string, diff: unknown) {
  await supabaseAdmin.from("audit_logs").insert({
    school_id: schoolId, actor_id: actorId, actor_name: actorName,
    entity, entity_id: entityId, action, diff: diff as never,
  });
}

const phoneRegex = /^[+0-9 \-()]{7,20}$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const GuardianInput = z.object({
  full_name: z.string().trim().min(1).max(120),
  relationship: z.enum(["father", "mother", "guardian"]),
  phone: z.string().trim().regex(phoneRegex, "Invalid mobile"),
  email: z.string().trim().email().max(160).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(400).optional().nullable(),
  is_primary: z.boolean().default(false),
});

const StudentInput = z.object({
  attendance_id: z.string().trim().min(1).max(40),
  admission_number: z.string().trim().min(1).max(40),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  gender: z.enum(["male", "female", "other"]),
  date_of_birth: z.string().regex(dateRegex),
  photo_data_url: z.string().max(900_000).regex(/^data:image\//, "Invalid image").optional().nullable(),
  admission_date: z.string().regex(dateRegex),
  class_id: z.string().uuid(),
  section_id: z.string().uuid(),
  status: z.enum(["active", "inactive"]).default("active"),
  guardians: z.array(GuardianInput).max(10).default([]),
});

export const createStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => StudentInput.parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;

    const { data: dupAdm } = await supabaseAdmin.from("students")
      .select("id").eq("school_id", schoolId).eq("admission_number", data.admission_number).maybeSingle();
    if (dupAdm) return { ok: false as const, error: "Admission number already exists in this institute." };

    const full_name = `${data.first_name} ${data.last_name}`.trim();

    const insertRow = {
      school_id: schoolId,
      attendance_id: data.attendance_id,
      admission_number: data.admission_number,
      first_name: data.first_name,
      last_name: data.last_name,
      full_name,
      gender: data.gender,
      date_of_birth: data.date_of_birth,
      photo_url: data.photo_data_url ?? null,
      admission_date: data.admission_date,
      enrollment_date: data.admission_date,
      class_id: data.class_id,
      section_id: data.section_id,
      status: data.status,
    };

    const { data: row, error } = await supabaseAdmin.from("students")
      .insert(insertRow).select("id").single();
    if (error || !row) return { ok: false as const, error: error?.message ?? "Insert failed" };

    const guardians = data.guardians.map((g, i) => ({
      student_id: row.id,
      full_name: g.full_name,
      relationship: g.relationship,
      phone: g.phone,
      email: g.email || null,
      address: g.address ?? null,
      is_primary: i === 0 ? true : g.is_primary,
    }));
    if (guardians.length > 0) {
      const { error: gErr } = await supabaseAdmin.from("student_guardians").insert(guardians);
      if (gErr) return { ok: false as const, error: gErr.message };
    }

    await logAudit(schoolId, context.userId, actorName, "student", row.id, "create", {
      ...insertRow, photo_url: insertRow.photo_url ? "[image]" : null, guardians,
    });

    return { ok: true as const, id: row.id };
  });

const UpdateInput = StudentInput.extend({ id: z.string().uuid() });

export const updateStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;

    const { data: existing } = await supabaseAdmin.from("students")
      .select("*").eq("id", data.id).eq("school_id", schoolId).maybeSingle();
    if (!existing) return { ok: false as const, error: "Student not found." };

    if (data.admission_number !== existing.admission_number) {
      const { data: dup } = await supabaseAdmin.from("students")
        .select("id").eq("school_id", schoolId).eq("admission_number", data.admission_number).neq("id", data.id).maybeSingle();
      if (dup) return { ok: false as const, error: "Admission number already exists." };
    }

    const full_name = `${data.first_name} ${data.last_name}`.trim();
    const patch: Record<string, unknown> = {
      attendance_id: data.attendance_id,
      admission_number: data.admission_number,
      first_name: data.first_name,
      last_name: data.last_name,
      full_name,
      gender: data.gender,
      date_of_birth: data.date_of_birth,
      admission_date: data.admission_date,
      enrollment_date: data.admission_date,
      class_id: data.class_id,
      section_id: data.section_id,
      status: data.status,
    };
    if (data.photo_data_url !== undefined) patch.photo_url = data.photo_data_url;

    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(patch)) {
      const before = (existing as Record<string, unknown>)[k];
      if (before !== v) diff[k] = {
        from: k === "photo_url" && before ? "[image]" : before,
        to: k === "photo_url" && v ? "[image]" : v,
      };
    }

    const { error } = await supabaseAdmin.from("students").update(patch as never).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };

    // Replace guardians
    await supabaseAdmin.from("student_guardians").delete().eq("student_id", data.id);
    const guardians = data.guardians.map((g, i) => ({
      student_id: data.id,
      full_name: g.full_name,
      relationship: g.relationship,
      phone: g.phone,
      email: g.email || null,
      address: g.address ?? null,
      is_primary: i === 0 ? true : g.is_primary,
    }));
    if (guardians.length > 0) {
      const { error: gErr } = await supabaseAdmin.from("student_guardians").insert(guardians);
      if (gErr) return { ok: false as const, error: gErr.message };
    }

    await logAudit(schoolId, context.userId, actorName, "student", data.id, "update", {
      fields: diff, guardians,
    });
    return { ok: true as const };
  });

export const getStudentDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId } = guard;

    const { data: student } = await supabaseAdmin.from("students")
      .select("*").eq("id", data.id).eq("school_id", schoolId).maybeSingle();
    if (!student) return { ok: false as const, error: "Not found" };

    const { data: guardians } = await supabaseAdmin.from("student_guardians")
      .select("*").eq("student_id", data.id).order("is_primary", { ascending: false });

    return { ok: true as const, student, guardians: guardians ?? [] };
  });

export const deleteStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;
    const { data: existing } = await supabaseAdmin.from("students")
      .select("id, full_name").eq("id", data.id).eq("school_id", schoolId).maybeSingle();
    if (!existing) return { ok: false as const, error: "Student not found." };
    await supabaseAdmin.from("student_guardians").delete().eq("student_id", data.id);
    const { error } = await supabaseAdmin.from("students").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    await logAudit(schoolId, context.userId, actorName, "student", data.id, "delete", { full_name: existing.full_name });
    return { ok: true as const };
  });
