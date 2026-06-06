import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCurrentSchool } from "@/lib/use-current-school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { titleCase } from "@/lib/utils";
import { PageHeader } from "./_authenticated.classes";
import {
  StudentForm, emptyStudent, validateStudent, type StudentFormValues,
} from "@/components/student-form";
import { createStudent, deleteStudent } from "@/lib/students.functions";

export const Route = createFileRoute("/_authenticated/students/")({
  head: () => ({ meta: [{ title: "Students — Analysis" }] }),
  component: StudentsListPage,
});

function StudentsListPage() {
  const { roles } = useAuth();
  const { schoolId, schoolName } = useCurrentSchool();
  const isAdmin = roles.includes("admin") || roles.length === 0;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StudentFormValues>(emptyStudent);
  const [search, setSearch] = useState("");

  const create = useServerFn(createStudent);
  const remove = useServerFn(deleteStudent);

  const studentsQ = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id, full_name, attendance_id, admission_number, class_id, section_id, status, photo_url")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });
  const classesQ = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("id, name").order("name")).data ?? [],
  });
  const sectionsQ = useQuery({
    queryKey: ["sections"],
    queryFn: async () => (await supabase.from("sections").select("id, name, class_id").order("name")).data ?? [],
  });

  const classMap = Object.fromEntries((classesQ.data ?? []).map((c) => [c.id, c.name]));
  const sectionMap = Object.fromEntries((sectionsQ.data ?? []).map((s) => [s.id, s.name]));

  const add = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No institute. Create it in School Profile first.");
      const err = validateStudent(form);
      if (err) throw new Error(err);
      const res = await create({
        data: {
          attendance_id: form.attendance_id,
          admission_number: form.admission_number,
          first_name: form.first_name,
          last_name: form.last_name,
          gender: form.gender as "male" | "female" | "other",
          date_of_birth: form.date_of_birth,
          photo_data_url: form.photo_data_url,
          admission_date: form.admission_date,
          class_id: form.class_id,
          section_id: form.section_id,
          status: form.status,
          guardians: form.guardians.map((g) => ({
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
      toast.success("Student enrolled");
      setOpen(false); setForm(emptyStudent);
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await remove({ data: { id } });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Student removed");
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = studentsQ.data ?? [];
    if (!term) return list;
    return list.filter((s) =>
      [s.full_name, s.attendance_id, s.admission_number]
        .some((v) => (v ?? "").toString().toLowerCase().includes(term))
    );
  }, [studentsQ.data, term]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Students" subtitle="Enroll and manage student records." />
        {isAdmin && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyStudent); }}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Enroll Student</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Student</DialogTitle>
                {schoolName && <p className="text-xs text-muted-foreground">Institute: {schoolName}</p>}
              </DialogHeader>
              <StudentForm
                value={form}
                onChange={setForm}
                classes={classesQ.data ?? []}
                sections={sectionsQ.data ?? []}
              />
              <DialogFooter>
                <Button onClick={() => add.mutate()} disabled={add.isPending || !schoolId}>
                  {add.isPending ? "Saving…" : "Save Student"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, attendance ID, or admission number…"
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <ScrollArea className="max-h-[60vh] pr-2">
          {studentsQ.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !rows.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {term ? "No matching students." : "No students enrolled yet."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="py-2 pr-3 font-medium">Attendance ID</th>
                  <th className="py-2 pr-3 font-medium">Admission #</th>
                  <th className="py-2 pr-3 font-medium">Class</th>
                  <th className="py-2 pr-3 font-medium">Section</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  {isAdmin && <th className="py-2 text-right" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="py-3 pr-3">
                      <Link to="/students/$studentId" params={{ studentId: s.id }} className="flex items-center gap-3">
                        <div className="h-9 w-9 overflow-hidden rounded-full bg-muted">
                          {s.photo_url ? <img src={s.photo_url} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="font-medium text-foreground hover:underline">{titleCase(s.full_name)}</div>
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{s.attendance_id ?? "—"}</td>
                    <td className="py-3 pr-3">{s.admission_number ?? "—"}</td>
                    <td className="py-3 pr-3">{classMap[s.class_id ?? ""] ?? "—"}</td>
                    <td className="py-3 pr-3">{sectionMap[s.section_id ?? ""] ?? "—"}</td>
                    <td className="py-3 pr-3">
                      <span className={
                        "rounded-full px-2 py-0.5 text-xs " +
                        (s.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")
                      }>
                        {titleCase(s.status ?? "active")}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => del.mutate(s.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
