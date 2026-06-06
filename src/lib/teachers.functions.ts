import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ---------- Shared admin guard ---------- */
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

/* ---------- Schemas ---------- */
const cnicRegex = /^[0-9-]{6,20}$/;
const phoneRegex = /^[+0-9 \-()]{7,20}$/;

const TeacherInput = z.object({
  employee_id: z.string().trim().max(40).optional().nullable(),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  cnic: z.string().trim().regex(cnicRegex, "Invalid CNIC"),
  photo_data_url: z.string().max(900_000).regex(/^data:image\//, "Invalid image").optional().nullable(),
  phone: z.string().trim().regex(phoneRegex, "Invalid mobile number"),
  email: z.string().trim().email().max(160),
  address: z.string().trim().max(400).optional().nullable(),
  joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  designation: z.string().trim().min(1).max(80),
  department: z.string().trim().min(1).max(80),
  status: z.enum(["active", "inactive"]).default("active"),
  subject: z.string().trim().max(120).optional().nullable(),
});

const CreateInput = TeacherInput.extend({
  loginMode: z.enum(["password", "invite", "none"]).default("none"),
  password: z.string().min(8).max(72).optional().nullable(),
});

/* ---------- Create ---------- */
export const createTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;

    // uniqueness checks within school
    const { data: dupCnic } = await supabaseAdmin.from("teachers")
      .select("id").eq("school_id", schoolId).eq("cnic", data.cnic).maybeSingle();
    if (dupCnic) return { ok: false as const, error: "CNIC already exists in this institute." };
    const { data: dupEmail } = await supabaseAdmin.from("teachers")
      .select("id").eq("school_id", schoolId).ilike("email", data.email).maybeSingle();
    if (dupEmail) return { ok: false as const, error: "Email already exists in this institute." };

    const full_name = `${data.first_name} ${data.last_name}`.trim();

    const insertRow = {
      school_id: schoolId,
      employee_id: data.employee_id ?? null,
      first_name: data.first_name,
      last_name: data.last_name,
      full_name,
      gender: data.gender ?? null,
      date_of_birth: data.date_of_birth ?? null,
      cnic: data.cnic,
      photo_url: data.photo_data_url ?? null,
      phone: data.phone,
      email: data.email,
      address: data.address ?? null,
      joining_date: data.joining_date,
      designation: data.designation,
      department: data.department,
      status: data.status,
      subject: data.subject ?? null,
    };

    const { data: row, error } = await supabaseAdmin.from("teachers")
      .insert(insertRow).select("id").single();
    if (error || !row) return { ok: false as const, error: error?.message ?? "Insert failed" };

    // login provisioning
    let loginError: string | null = null;
    if (data.loginMode === "password") {
      if (!data.password) return { ok: false as const, error: "Password required." };
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (cErr || !created.user) {
        loginError = cErr?.message ?? "Could not create login";
      } else {
        await supabaseAdmin.from("profiles").upsert(
          { id: created.user.id, full_name, email: data.email, school_id: schoolId },
          { onConflict: "id" });
        await supabaseAdmin.from("user_roles").upsert(
          { user_id: created.user.id, role: "teacher", school_id: schoolId },
          { onConflict: "user_id,role,school_id" });
        await supabaseAdmin.from("teachers").update({ user_id: created.user.id }).eq("id", row.id);
      }
    } else if (data.loginMode === "invite") {
      const redirectTo = `${process.env.PUBLIC_APP_URL ?? ""}/reset-password`;
      const inv = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        data: { full_name }, redirectTo: redirectTo || undefined,
      });
      if (inv.error) {
        loginError = inv.error.message;
      } else if (inv.data.user) {
        await supabaseAdmin.from("profiles").upsert(
          { id: inv.data.user.id, full_name, email: data.email, school_id: schoolId },
          { onConflict: "id" });
        await supabaseAdmin.from("user_roles").upsert(
          { user_id: inv.data.user.id, role: "teacher", school_id: schoolId },
          { onConflict: "user_id,role,school_id" });
        await supabaseAdmin.from("teachers").update({ user_id: inv.data.user.id }).eq("id", row.id);
      }
    }

    await logAudit(schoolId, context.userId, actorName, "teacher", row.id, "create", { ...insertRow, photo_url: insertRow.photo_url ? "[image]" : null });

    return { ok: true as const, id: row.id, loginError };
  });

/* ---------- Update ---------- */
const UpdateInput = TeacherInput.extend({ id: z.string().uuid() }).partial({
  employee_id: true, gender: true, date_of_birth: true, photo_data_url: true,
  address: true, subject: true, status: true,
}).extend({ id: z.string().uuid() });

export const updateTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;

    const { data: existing } = await supabaseAdmin.from("teachers")
      .select("*").eq("id", data.id).eq("school_id", schoolId).maybeSingle();
    if (!existing) return { ok: false as const, error: "Teacher not found." };

    if (data.cnic && data.cnic !== existing.cnic) {
      const { data: dup } = await supabaseAdmin.from("teachers")
        .select("id").eq("school_id", schoolId).eq("cnic", data.cnic).neq("id", data.id).maybeSingle();
      if (dup) return { ok: false as const, error: "CNIC already exists." };
    }
    if (data.email && data.email.toLowerCase() !== (existing.email ?? "").toLowerCase()) {
      const { data: dup } = await supabaseAdmin.from("teachers")
        .select("id").eq("school_id", schoolId).ilike("email", data.email).neq("id", data.id).maybeSingle();
      if (dup) return { ok: false as const, error: "Email already exists." };
    }

    const full_name = `${data.first_name} ${data.last_name}`.trim();
    const patch: Record<string, unknown> = {
      employee_id: data.employee_id ?? null,
      first_name: data.first_name,
      last_name: data.last_name,
      full_name,
      gender: data.gender ?? null,
      date_of_birth: data.date_of_birth ?? null,
      cnic: data.cnic,
      phone: data.phone,
      email: data.email,
      address: data.address ?? null,
      joining_date: data.joining_date,
      designation: data.designation,
      department: data.department,
      status: data.status ?? existing.status,
      subject: data.subject ?? null,
    };
    if (data.photo_data_url !== undefined) patch.photo_url = data.photo_data_url;

    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(patch)) {
      const before = (existing as Record<string, unknown>)[k];
      if (before !== v) diff[k] = { from: k === "photo_url" && before ? "[image]" : before, to: k === "photo_url" && v ? "[image]" : v };
    }

    const { error } = await supabaseAdmin.from("teachers").update(patch).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };

    if (Object.keys(diff).length) {
      await logAudit(schoolId, context.userId, actorName, "teacher", data.id, "update", diff);
    }
    return { ok: true as const };
  });

/* ---------- Get teacher detail with assignments ---------- */
export const getTeacherDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId } = guard;

    const { data: teacher } = await supabaseAdmin.from("teachers")
      .select("*").eq("id", data.id).eq("school_id", schoolId).maybeSingle();
    if (!teacher) return { ok: false as const, error: "Not found" };

    const [subs, cls, secs, ct, audit] = await Promise.all([
      supabaseAdmin.from("teacher_subjects").select("id, subject").eq("teacher_id", data.id),
      supabaseAdmin.from("teacher_classes").select("id, class_id, classes(name)").eq("teacher_id", data.id),
      supabaseAdmin.from("section_teachers").select("id, section_id, sections(name, class_id, classes(name))").eq("teacher_id", data.id),
      supabaseAdmin.from("class_teachers").select("id, class_id, section_id, classes(name), sections(name)").eq("teacher_id", data.id),
      supabaseAdmin.from("audit_logs").select("id, action, diff, actor_name, created_at")
        .eq("entity", "teacher").eq("entity_id", data.id).order("created_at", { ascending: false }).limit(50),
    ]);

    return {
      ok: true as const,
      teacher,
      subjects: subs.data ?? [],
      classes: cls.data ?? [],
      sections: secs.data ?? [],
      classTeacherOf: ct.data ?? [],
      audit: audit.data ?? [],
    };
  });

/* ---------- Set assignments (full replace) ---------- */
const AssignInput = z.object({
  teacherId: z.string().uuid(),
  subjects: z.array(z.string().trim().min(1).max(80)).max(50),
  classIds: z.array(z.string().uuid()).max(100),
  sectionIds: z.array(z.string().uuid()).max(200),
  classTeacherOf: z.array(z.object({ classId: z.string().uuid(), sectionId: z.string().uuid() })).max(50),
});

export const setTeacherAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => AssignInput.parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;

    // verify teacher belongs to school
    const { data: t } = await supabaseAdmin.from("teachers")
      .select("id").eq("id", data.teacherId).eq("school_id", schoolId).maybeSingle();
    if (!t) return { ok: false as const, error: "Teacher not found." };

    // For each class_teacher pair, ensure no other teacher already claims it
    for (const p of data.classTeacherOf) {
      const { data: clash } = await supabaseAdmin.from("class_teachers")
        .select("teacher_id").eq("class_id", p.classId).eq("section_id", p.sectionId).maybeSingle();
      if (clash && clash.teacher_id !== data.teacherId) {
        return { ok: false as const, error: "Another teacher is already the class teacher for one of the selected class/section pairs." };
      }
    }

    // Replace strategy
    await supabaseAdmin.from("teacher_subjects").delete().eq("teacher_id", data.teacherId);
    await supabaseAdmin.from("teacher_classes").delete().eq("teacher_id", data.teacherId);
    await supabaseAdmin.from("section_teachers").delete().eq("teacher_id", data.teacherId);
    await supabaseAdmin.from("class_teachers").delete().eq("teacher_id", data.teacherId);

    if (data.subjects.length) {
      await supabaseAdmin.from("teacher_subjects").insert(
        data.subjects.map((s) => ({ teacher_id: data.teacherId, subject: s }))
      );
    }
    if (data.classIds.length) {
      await supabaseAdmin.from("teacher_classes").insert(
        data.classIds.map((c) => ({ teacher_id: data.teacherId, class_id: c }))
      );
    }
    if (data.sectionIds.length) {
      await supabaseAdmin.from("section_teachers").insert(
        data.sectionIds.map((s) => ({ teacher_id: data.teacherId, section_id: s }))
      );
    }
    if (data.classTeacherOf.length) {
      await supabaseAdmin.from("class_teachers").insert(
        data.classTeacherOf.map((p) => ({
          teacher_id: data.teacherId, class_id: p.classId, section_id: p.sectionId, school_id: schoolId,
        }))
      );
    }

    await logAudit(schoolId, context.userId, actorName, "teacher", data.teacherId, "assignments", data);

    return { ok: true as const };
  });
