import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { getStudentDetail, updateStudent } from "@/lib/students.functions";
import {
  StudentForm, studentFromRow, validateStudent, type StudentFormValues,
} from "@/components/student-form";
import { titleCase } from "@/lib/utils";

import { getUserErrorMessage } from "@/lib/user-error";
export const Route = createFileRoute("/_authenticated/students/$studentId")({
  head: ({ params }) => ({ meta: [{ title: `Student · ${params.studentId.slice(0, 8)}` }] }),
  component: StudentProfilePage,
});

function StudentProfilePage() {
  const { studentId } = Route.useParams();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.length === 0;
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getStudentDetail);
  const updateFn = useServerFn(updateStudent);

  const detailQ = useQuery({
    queryKey: ["student-detail", studentId],
    queryFn: () => fetchDetail({ data: { id: studentId } }),
  });
  const classesQ = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("id, name").order("name")).data ?? [],
  });
  const sectionsQ = useQuery({
    queryKey: ["sections"],
    queryFn: async () => (await supabase.from("sections").select("id, name, class_id").order("name")).data ?? [],
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<StudentFormValues | null>(null);

  const update = useMutation({
    mutationFn: async (v: StudentFormValues) => {
      const err = validateStudent(v);
      if (err) throw new Error(err);
      const res = await updateFn({
        data: {
          id: studentId,
          attendance_id: v.attendance_id,
          admission_number: v.admission_number,
          first_name: v.first_name,
          last_name: v.last_name,
          gender: v.gender as "male" | "female" | "other",
          date_of_birth: v.date_of_birth,
          photo_data_url: v.photo_data_url,
          admission_date: v.admission_date,
          class_id: v.class_id,
          section_id: v.section_id,
          status: v.status,
          guardians: v.guardians.map((g) => ({
            full_name: g.full_name,
            relationship: g.relationship as "father" | "mother" | "guardian",
            phone: g.phone,
            email: g.email || null,
            address: g.address || null,
            is_primary: g.is_primary,
          })),
        },
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Student updated");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["student-detail", studentId] });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(getUserErrorMessage(e)),
  });

  if (detailQ.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!detailQ.data?.ok) return <p className="text-sm text-destructive">{detailQ.data?.error ? getUserErrorMessage(detailQ.data.error, "Record not found.") : "Record not found."}</p>;

  const s = detailQ.data.student as Record<string, unknown>;
  const guardians = detailQ.data.guardians as Record<string, unknown>[];
  const classMap = new Map((classesQ.data ?? []).map((c) => [c.id, c.name]));
  const sectionMap = new Map((sectionsQ.data ?? []).map((sec) => [sec.id, sec.name]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back To Students
        </Link>
        {isAdmin && (
          <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (o) setEditForm(studentFromRow(s, guardians)); }}>
            <DialogTrigger asChild><Button variant="outline"><Pencil className="mr-1 h-4 w-4" />Edit</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Edit Student</DialogTitle></DialogHeader>
              {editForm && (
                <StudentForm
                  value={editForm}
                  onChange={setEditForm}
                  classes={classesQ.data ?? []}
                  sections={sectionsQ.data ?? []}
                />
              )}
              <DialogFooter>
                <Button onClick={() => editForm && update.mutate(editForm)} disabled={update.isPending || !editForm || validateStudent(editForm) !== null}>
                  <Save className="mr-1 h-4 w-4" />{update.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <section className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] md:flex-row">
        <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full bg-muted">
          {s.photo_url ? <img src={s.photo_url as string} alt="" className="h-full w-full object-cover" />
            : <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">No photo</div>}
        </div>
        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
          <Item label="Full Name" value={titleCase(String(s.full_name ?? ""))} />
          <Item label="Attendance ID" value={String(s.attendance_id ?? "—")} />
          <Item label="Admission Number" value={String(s.admission_number ?? "—")} />
          <Item label="Gender" value={titleCase(String(s.gender ?? "—"))} />
          <Item label="Date Of Birth" value={String(s.date_of_birth ?? "—")} />
          <Item label="Admission Date" value={String((s.admission_date ?? s.enrollment_date) ?? "—")} />
          <Item label="Class" value={classMap.get(s.class_id as string) ?? "—"} />
          <Item label="Section" value={sectionMap.get(s.section_id as string) ?? "—"} />
          <Item label="Status" value={titleCase(String(s.status ?? "active"))} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="mb-4 text-lg font-semibold">Guardian Information</h2>
        {guardians.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guardians recorded.</p>
        ) : (
          <div className="space-y-4">
            {guardians.map((g) => (
              <div key={String(g.id)} className="rounded-md border border-border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="font-medium">{titleCase(String(g.full_name ?? ""))}</div>
                  {g.is_primary ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Primary</span>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
                  <Item label="Relationship" value={titleCase(String(g.relationship ?? "—"))} />
                  <Item label="Mobile Number" value={String(g.phone ?? "—")} />
                  <Item label="Email Address" value={String(g.email ?? "—")} />
                  <Item label="Residential Address" value={String(g.address ?? "—")} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}
