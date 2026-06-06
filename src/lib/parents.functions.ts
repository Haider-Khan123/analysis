import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const RELATIONSHIP_TYPES = [
  "son", "daughter",
] as const;
export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

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

const ParentInput = z.object({
  parent_id: z.string().trim().min(1).max(40),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  phone: z.string().trim().regex(phoneRegex, "Invalid mobile number"),
  alternate_phone: z.string().trim().regex(phoneRegex).optional().nullable().or(z.literal("")),
  email: z.string().trim().email().max(160),
  cnic: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  occupation: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(400).optional().nullable().or(z.literal("")),
  city: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  photo_data_url: z.string().max(900_000).regex(/^data:image\//).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const StudentLinkInput = z.object({
  student_id: z.string().uuid(),
  relationship_type: z.enum(RELATIONSHIP_TYPES),
  is_primary: z.boolean().default(false),
});

const CreateParentInput = ParentInput.extend({
  loginMode: z.enum(["password", "invite", "none"]).default("password"),
  password: z.string().min(8).max(72).optional().or(z.literal("")),
  students: z.array(StudentLinkInput).default([]),
});

export const createParent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => CreateParentInput.parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;

    const { data: dup } = await supabaseAdmin.from("parents")
      .select("id").eq("school_id", schoolId).eq("parent_id", data.parent_id).maybeSingle();
    if (dup) return { ok: false as const, error: "Parent ID already exists in this institute." };

    const { data: dupEmail } = await supabaseAdmin.from("parents")
      .select("id").eq("school_id", schoolId).ilike("email", data.email).maybeSingle();
    if (dupEmail) return { ok: false as const, error: "Email already exists in this institute." };

    const full_name = `${data.first_name} ${data.last_name}`.trim();
    const insertRow = {
      school_id: schoolId,
      parent_id: data.parent_id,
      first_name: data.first_name,
      last_name: data.last_name,
      full_name,
      phone: data.phone,
      alternate_phone: data.alternate_phone || null,
      email: data.email,
      cnic: data.cnic || null,
      occupation: data.occupation || null,
      address: data.address || null,
      city: data.city || null,
      photo_url: data.photo_data_url ?? null,
      status: data.status,
      relationship: null,
    };
    const { data: row, error } = await supabaseAdmin.from("parents")
      .insert(insertRow).select("id").single();
    if (error || !row) return { ok: false as const, error: error?.message ?? "Insert failed" };

    // Provision login
    let loginError: string | null = null;
    if (data.loginMode === "password") {
      if (!data.password) {
        loginError = "Password required";
      } else {
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
            { user_id: created.user.id, role: "parent", school_id: schoolId },
            { onConflict: "user_id,role,school_id" });
          await supabaseAdmin.from("parents").update({ user_id: created.user.id }).eq("id", row.id);
        }
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
          { user_id: inv.data.user.id, role: "parent", school_id: schoolId },
          { onConflict: "user_id,role,school_id" });
        await supabaseAdmin.from("parents").update({ user_id: inv.data.user.id }).eq("id", row.id);
      }
    }

    // Initial student links
    const linkErrors: string[] = [];
    if (data.students.length > 0) {
      const ids = Array.from(new Set(data.students.map((s) => s.student_id)));
      const { data: valid } = await supabaseAdmin.from("students")
        .select("id").in("id", ids).eq("school_id", schoolId);
      const validSet = new Set((valid ?? []).map((v) => v.id));
      for (const link of data.students) {
        if (!validSet.has(link.student_id)) { linkErrors.push("Invalid student skipped"); continue; }
        if (link.is_primary) {
          await supabaseAdmin.from("parent_students")
            .update({ is_primary: false }).eq("student_id", link.student_id).eq("is_primary", true);
        }
        const { error: lErr } = await supabaseAdmin.from("parent_students").insert({
          parent_id: row.id, student_id: link.student_id,
          relationship_type: link.relationship_type, is_primary: link.is_primary,
        });
        if (lErr) linkErrors.push(lErr.message);
      }
    }

    await logAudit(schoolId, context.userId, actorName, "parent", row.id, "create", {
      ...insertRow, photo_url: insertRow.photo_url ? "[image]" : null,
      students: data.students,
    });
    return {
      ok: true as const, id: row.id, loginError,
      linkError: linkErrors.length ? linkErrors.join("; ") : null,
    };
  });


const UpdateInput = ParentInput.extend({ id: z.string().uuid() });

export const updateParent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;

    const { data: existing } = await supabaseAdmin.from("parents")
      .select("*").eq("id", data.id).eq("school_id", schoolId).maybeSingle();
    if (!existing) return { ok: false as const, error: "Parent not found." };

    if (data.parent_id !== existing.parent_id) {
      const { data: dup } = await supabaseAdmin.from("parents")
        .select("id").eq("school_id", schoolId).eq("parent_id", data.parent_id).neq("id", data.id).maybeSingle();
      if (dup) return { ok: false as const, error: "Parent ID already exists." };
    }

    const full_name = `${data.first_name} ${data.last_name}`.trim();
    const patch: Record<string, unknown> = {
      parent_id: data.parent_id,
      first_name: data.first_name,
      last_name: data.last_name,
      full_name,
      phone: data.phone,
      alternate_phone: data.alternate_phone || null,
      email: data.email || null,
      cnic: data.cnic || null,
      occupation: data.occupation || null,
      address: data.address || null,
      city: data.city || null,
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
    const { error } = await supabaseAdmin.from("parents").update(patch as never).eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };

    await logAudit(schoolId, context.userId, actorName, "parent", data.id, "update", { fields: diff });
    return { ok: true as const };
  });

export const getParentDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId } = guard;

    const { data: parent } = await supabaseAdmin.from("parents")
      .select("*").eq("id", data.id).eq("school_id", schoolId).maybeSingle();
    if (!parent) return { ok: false as const, error: "Not found" };

    const { data: links } = await supabaseAdmin.from("parent_students")
      .select("id, student_id, relationship_type, is_primary")
      .eq("parent_id", data.id);

    const studentIds = (links ?? []).map((l) => l.student_id);
    const students = studentIds.length
      ? (await supabaseAdmin.from("students")
          .select("id, full_name, admission_number, attendance_id, class_id, section_id")
          .in("id", studentIds)).data ?? []
      : [];

    return { ok: true as const, parent, links: links ?? [], students };
  });

export const deleteParent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;
    const { data: existing } = await supabaseAdmin.from("parents")
      .select("id, full_name").eq("id", data.id).eq("school_id", schoolId).maybeSingle();
    if (!existing) return { ok: false as const, error: "Parent not found." };
    await supabaseAdmin.from("parent_students").delete().eq("parent_id", data.id);
    const { error } = await supabaseAdmin.from("parents").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    await logAudit(schoolId, context.userId, actorName, "parent", data.id, "delete", { full_name: existing.full_name });
    return { ok: true as const };
  });

const LinkInput = z.object({
  parent_id: z.string().uuid(),
  student_id: z.string().uuid(),
  relationship_type: z.enum(RELATIONSHIP_TYPES),
  is_primary: z.boolean().default(false),
});

export const linkStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => LinkInput.parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;

    // Verify both belong to this school
    const { data: p } = await supabaseAdmin.from("parents").select("id").eq("id", data.parent_id).eq("school_id", schoolId).maybeSingle();
    const { data: s } = await supabaseAdmin.from("students").select("id").eq("id", data.student_id).eq("school_id", schoolId).maybeSingle();
    if (!p || !s) return { ok: false as const, error: "Invalid parent or student." };

    if (data.is_primary) {
      // demote any existing primary for this student
      await supabaseAdmin.from("parent_students")
        .update({ is_primary: false }).eq("student_id", data.student_id).eq("is_primary", true);
    }

    const { error } = await supabaseAdmin.from("parent_students").insert({
      parent_id: data.parent_id, student_id: data.student_id,
      relationship_type: data.relationship_type, is_primary: data.is_primary,
    });
    if (error) return { ok: false as const, error: error.message };
    await logAudit(schoolId, context.userId, actorName, "parent", data.parent_id, "link_student",
      { student_id: data.student_id, relationship_type: data.relationship_type, is_primary: data.is_primary });
    return { ok: true as const };
  });

export const unlinkStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ link_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;
    const { data: link } = await supabaseAdmin.from("parent_students")
      .select("id, parent_id, student_id").eq("id", data.link_id).maybeSingle();
    if (!link) return { ok: false as const, error: "Link not found." };
    const { error } = await supabaseAdmin.from("parent_students").delete().eq("id", data.link_id);
    if (error) return { ok: false as const, error: error.message };
    await logAudit(schoolId, context.userId, actorName, "parent", link.parent_id, "unlink_student", { student_id: link.student_id });
    return { ok: true as const };
  });

const UpdateLinkInput = z.object({
  link_id: z.string().uuid(),
  relationship_type: z.enum(RELATIONSHIP_TYPES).optional(),
  is_primary: z.boolean().optional(),
});

export const updateLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateLinkInput.parse(i))
  .handler(async ({ data, context }) => {
    const guard = await assertAdminSchool(context.userId);
    if ("error" in guard) return { ok: false as const, error: guard.error };
    const { schoolId, actorName } = guard;
    const { data: link } = await supabaseAdmin.from("parent_students")
      .select("id, parent_id, student_id, is_primary, relationship_type")
      .eq("id", data.link_id).maybeSingle();
    if (!link) return { ok: false as const, error: "Link not found." };

    const patch: Record<string, unknown> = {};
    if (data.relationship_type !== undefined) patch.relationship_type = data.relationship_type;
    if (data.is_primary !== undefined) patch.is_primary = data.is_primary;

    if (data.is_primary === true) {
      await supabaseAdmin.from("parent_students")
        .update({ is_primary: false }).eq("student_id", link.student_id).eq("is_primary", true);
    }
    const { error } = await supabaseAdmin.from("parent_students")
      .update(patch as never).eq("id", data.link_id);
    if (error) return { ok: false as const, error: error.message };
    await logAudit(schoolId, context.userId, actorName, "parent", link.parent_id, "update_link", { link_id: data.link_id, ...patch });
    return { ok: true as const };
  });
