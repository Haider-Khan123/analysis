import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Save, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getTeacherDetail, updateTeacher, setTeacherAssignments,
} from "@/lib/teachers.functions";
import {
  TeacherForm, teacherFromRow, validateTeacher, type TeacherFormValues,
} from "@/components/teacher-form";
import { titleCase } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/teachers/$teacherId")({
  head: ({ params }) => ({ meta: [{ title: `Teacher · ${params.teacherId.slice(0, 8)}` }] }),
  component: TeacherProfilePage,
});

function TeacherProfilePage() {
  const { teacherId } = Route.useParams();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.length === 0;
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getTeacherDetail);
  const updateFn = useServerFn(updateTeacher);
  const assignFn = useServerFn(setTeacherAssignments);

  const detailQ = useQuery({
    queryKey: ["teacher-detail", teacherId],
    queryFn: () => fetchDetail({ data: { id: teacherId } }),
  });

  const classesQ = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });
  const sectionsQ = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sections").select("id, name, class_id").order("name");
      if (error) throw error;
      return data;
    },
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<TeacherFormValues | null>(null);

  const update = useMutation({
    mutationFn: async (v: TeacherFormValues) => {
      const err = validateTeacher(v, { requireLogin: false });
      if (err) throw new Error(err);
      const res = await updateFn({
        data: {
          id: teacherId,
          employee_id: v.employee_id || null,
          first_name: v.first_name, last_name: v.last_name,
          gender: v.gender || null,
          date_of_birth: v.date_of_birth || null,
          cnic: v.cnic, photo_data_url: v.photo_data_url,
          phone: v.phone, email: v.email,
          address: v.address || null,
          joining_date: v.joining_date,
          designation: v.designation, department: v.department,
          status: v.status, subject: v.subject || null,
        },
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Teacher updated");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["teacher-detail", teacherId] });
      qc.invalidateQueries({ queryKey: ["teachers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (detailQ.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!detailQ.data?.ok) return <p className="text-sm text-destructive">{detailQ.data?.error ?? "Not found"}</p>;

  const d = detailQ.data;
  const t = d.teacher as Record<string, unknown>;
  const classMap = new Map((classesQ.data ?? []).map((c) => [c.id, c.name]));
  const sectionMap = new Map((sectionsQ.data ?? []).map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/teachers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back To Teachers
        </Link>
        {isAdmin && (
          <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (o) setEditForm(teacherFromRow(t)); }}>
            <DialogTrigger asChild><Button variant="outline"><Pencil className="mr-1 h-4 w-4" />Edit</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Edit Teacher</DialogTitle></DialogHeader>
              {editForm && <TeacherForm value={editForm} onChange={setEditForm} mode="edit" />}
              <DialogFooter>
                <Button onClick={() => editForm && update.mutate(editForm)} disabled={update.isPending}>
                  <Save className="mr-1 h-4 w-4" />{update.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <section className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] md:flex-row">
        <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full bg-muted">
          {t.photo_url ? <img src={t.photo_url as string} alt="" className="h-full w-full object-cover" />
            : <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">No photo</div>}
        </div>
        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
          <Field2 label="Full Name" value={titleCase(String(t.full_name ?? ""))} />
          <Field2 label="Employee ID" value={String(t.employee_id ?? "—")} />
          <Field2 label="CNIC" value={String(t.cnic ?? "—")} />
          <Field2 label="Mobile" value={String(t.phone ?? "—")} />
          <Field2 label="Email" value={String(t.email ?? "—")} />
          <Field2 label="Gender" value={titleCase(String(t.gender ?? "—"))} />
          <Field2 label="Date Of Birth" value={String(t.date_of_birth ?? "—")} />
          <Field2 label="Joining Date" value={String(t.joining_date ?? "—")} />
          <Field2 label="Designation" value={titleCase(String(t.designation ?? "—"))} />
          <Field2 label="Department" value={titleCase(String(t.department ?? "—"))} />
          <Field2 label="Status" value={titleCase(String(t.status ?? "active"))} />
          <Field2 label="Login" value={t.user_id ? "Active" : "Not set"} />
          <div className="md:col-span-2"><Field2 label="Address" value={String(t.address ?? "—")} /></div>
        </div>
      </section>

      {isAdmin && (
        <AssignmentsPanel
          teacherId={teacherId}
          initialSubjects={d.subjects.map((s) => s.subject)}
          initialClassIds={d.classes.map((c) => c.class_id)}
          initialSectionIds={d.sections.map((s) => s.section_id)}
          initialClassTeacher={d.classTeacherOf.map((c) => ({ classId: c.class_id, sectionId: c.section_id }))}
          classes={classesQ.data ?? []}
          sections={sectionsQ.data ?? []}
          onSave={async (payload) => {
            const res = await assignFn({ data: { teacherId, ...payload } });
            if (!res.ok) throw new Error(res.error);
            toast.success("Assignments updated");
            qc.invalidateQueries({ queryKey: ["teacher-detail", teacherId] });
          }}
        />
      )}

      {!isAdmin && (
        <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="mb-3 text-lg font-semibold">Teaching Assignments</h2>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div><Label className="text-xs text-muted-foreground">Subjects</Label><div>{d.subjects.length ? d.subjects.map((s) => s.subject).join(", ") : "—"}</div></div>
            <div><Label className="text-xs text-muted-foreground">Classes</Label>
              <div>{d.classes.length ? d.classes.map((c) => classMap.get(c.class_id) ?? c.class_id).join(", ") : "—"}</div>
            </div>
            <div><Label className="text-xs text-muted-foreground">Sections</Label>
              <div>{d.sections.length ? d.sections.map((s) => {
                const sec = sectionMap.get(s.section_id);
                return sec ? `${classMap.get(sec.class_id) ?? ""}-${sec.name}` : s.section_id;
              }).join(", ") : "—"}</div>
            </div>
            <div><Label className="text-xs text-muted-foreground">Class Teacher</Label>
              <div>{d.classTeacherOf.length ? d.classTeacherOf.map((c) =>
                `${classMap.get(c.class_id) ?? ""}-${sectionMap.get(c.section_id)?.name ?? ""}`
              ).join(", ") : "—"}</div>
            </div>
          </div>
        </section>
      )}

    </div>
  );
}

function Field2({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

type AssignPayload = {
  subjects: string[];
  classIds: string[];
  sectionIds: string[];
  classTeacherOf: { classId: string; sectionId: string }[];
};

function AssignmentsPanel({
  initialSubjects, initialClassIds, initialSectionIds, initialClassTeacher,
  classes, sections, onSave,
}: {
  teacherId: string;
  initialSubjects: string[];
  initialClassIds: string[];
  initialSectionIds: string[];
  initialClassTeacher: { classId: string; sectionId: string }[];
  classes: { id: string; name: string }[];
  sections: { id: string; name: string; class_id: string }[];
  onSave: (p: AssignPayload) => Promise<void>;
}) {
  const [subjects, setSubjects] = useState<string[]>(initialSubjects);
  const [newSubject, setNewSubject] = useState("");
  const [classIds, setClassIds] = useState<Set<string>>(new Set(initialClassIds));
  const [sectionIds, setSectionIds] = useState<Set<string>>(new Set(initialSectionIds));
  const [isClassTeacher, setIsClassTeacher] = useState(initialClassTeacher.length > 0);
  const [ctClass, setCtClass] = useState(initialClassTeacher[0]?.classId ?? "");
  const [ctSection, setCtSection] = useState(initialClassTeacher[0]?.sectionId ?? "");
  const [saving, setSaving] = useState(false);

  const uniqueClasses = useMemo(() => {
    const seen = new Set<string>();
    return classes.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
  }, [classes]);
  const ctSections = sections.filter((s) => s.class_id === ctClass);

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  const addSubject = () => {
    const s = newSubject.trim();
    if (!s) return;
    if (subjects.includes(s)) { toast.error("Already added"); return; }
    setSubjects([...subjects, s]); setNewSubject("");
  };

  const save = async () => {
    if (isClassTeacher && (!ctClass || !ctSection)) { toast.error("Pick class & section for class teacher."); return; }
    setSaving(true);
    try {
      await onSave({
        subjects, classIds: [...classIds], sectionIds: [...sectionIds],
        classTeacherOf: isClassTeacher ? [{ classId: ctClass, sectionId: ctSection }] : [],
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Teaching Assignments</h2>
        <Button onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? "Saving…" : "Save assignments"}</Button>
      </div>

      <div>
        <Label className="text-sm">Subjects</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {subjects.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
              {s}
              <button onClick={() => setSubjects(subjects.filter((x) => x !== s))} aria-label="Remove">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {subjects.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
        </div>
        <div className="mt-2 flex gap-2">
          <Input placeholder="Add subject…" value={newSubject} onChange={(e) => setNewSubject(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubject())} />
          <Button type="button" variant="outline" onClick={addSubject}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label className="text-sm">Classes</Label>
          <ScrollArea className="mt-2 max-h-48 rounded-md border border-border p-2">
            {uniqueClasses.length === 0 && <span className="text-xs text-muted-foreground">No classes</span>}
            <div className="space-y-1.5">
              {uniqueClasses.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={classIds.has(c.id)} onCheckedChange={() => toggle(classIds, c.id, setClassIds)} />
                  {c.name}
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>
        <div>
          <Label className="text-sm">Sections</Label>
          <ScrollArea className="mt-2 max-h-48 rounded-md border border-border p-2">
            {sections.length === 0 && <span className="text-xs text-muted-foreground">No sections</span>}
            <div className="space-y-1.5">
              {sections.map((s) => {
                const cls = classes.find((c) => c.id === s.class_id);
                return (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={sectionIds.has(s.id)} onCheckedChange={() => toggle(sectionIds, s.id, setSectionIds)} />
                    {cls?.name ?? "?"}-{s.name}
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={isClassTeacher} onCheckedChange={(v) => setIsClassTeacher(!!v)} />
          Is class teacher?
        </label>
        {isClassTeacher && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Class</Label>
              <Select value={ctClass} onValueChange={(v) => { setCtClass(v); setCtSection(""); }}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {uniqueClasses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Section</Label>
              <Select value={ctSection} onValueChange={setCtSection} disabled={!ctClass}>
                <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  {ctSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Only one class teacher per class+section combination.</p>
      </div>
    </section>
  );
}
