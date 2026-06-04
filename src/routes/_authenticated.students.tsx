import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, EntityTable } from "./_authenticated.classes";
import { Field } from "./_authenticated.teachers";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({ meta: [{ title: "Students — Analysis" }] }),
  component: StudentsPage,
});

function StudentsPage() {
  const { profile, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", admission_number: "", class_id: "", section_id: "" });

  const studentsQ = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id, full_name, admission_number, class_id, section_id").order("full_name");
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

  const add = useMutation({
    mutationFn: async () => {
      if (!profile?.school_id) throw new Error("No school");
      const { error } = await supabase.from("students").insert({
        full_name: form.full_name,
        admission_number: form.admission_number || null,
        class_id: form.class_id || null,
        section_id: form.section_id || null,
        school_id: profile.school_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student enrolled");
      setOpen(false);
      setForm({ full_name: "", admission_number: "", class_id: "", section_id: "" });
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student removed");
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sectionsForClass = (sectionsQ.data ?? []).filter((s) => s.class_id === form.class_id);
  const classMap = Object.fromEntries((classesQ.data ?? []).map((c) => [c.id, c.name]));
  const sectionMap = Object.fromEntries((sectionsQ.data ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Students" subtitle="Enroll and manage student records." />
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Enroll student</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enroll a student</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
                <Field label="Admission number" value={form.admission_number} onChange={(v) => setForm({ ...form, admission_number: v })} />
                <div className="space-y-2">
                  <Label>Class</Label>
                  <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v, section_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>{(classesQ.data ?? []).map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Section</Label>
                  <Select value={form.section_id} onValueChange={(v) => setForm({ ...form, section_id: v })} disabled={!form.class_id}>
                    <SelectTrigger><SelectValue placeholder={form.class_id ? "Select section" : "Pick a class first"} /></SelectTrigger>
                    <SelectContent>{sectionsForClass.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={() => add.mutate()} disabled={!form.full_name || add.isPending}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <EntityTable
          rows={(studentsQ.data ?? []).map((s) => ({
            ...s,
            class_name: classMap[s.class_id ?? ""] ?? "—",
            section_name: sectionMap[s.section_id ?? ""] ?? "—",
          }))}
          loading={studentsQ.isLoading}
          columns={[
            { key: "full_name", label: "Name" },
            { key: "admission_number", label: "Admission #" },
            { key: "class_name", label: "Class" },
            { key: "section_name", label: "Section" },
          ]}
          onDelete={isAdmin ? (id) => del.mutate(id) : undefined}
          empty="No students enrolled yet."
        />
      </div>
    </div>
  );
}
