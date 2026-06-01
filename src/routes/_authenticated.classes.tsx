import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/classes")({
  head: () => ({ meta: [{ title: "Classes & Sections — Analysis" }] }),
  component: ClassesPage,
});

function ClassesPage() {
  const { profile, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();

  const classesQ = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes").select("id, name, grade_level").order("name");
      if (error) throw error;
      return data;
    },
  });

  const sectionsQ = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections").select("id, name, class_id").order("name");
      if (error) throw error;
      return data;
    },
  });

  const [openClass, setOpenClass] = useState(false);
  const [className, setClassName] = useState("");
  const [grade, setGrade] = useState("");

  const addClass = useMutation({
    mutationFn: async () => {
      if (!profile?.school_id) throw new Error("No school");
      const { error } = await supabase.from("classes").insert({
        name: className, grade_level: grade || null, school_id: profile.school_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Class added");
      setOpenClass(false); setClassName(""); setGrade("");
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delClass = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("classes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Class deleted");
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["sections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [openSec, setOpenSec] = useState(false);
  const [secName, setSecName] = useState("");
  const [secClass, setSecClass] = useState("");

  const addSection = useMutation({
    mutationFn: async () => {
      if (!profile?.school_id || !secClass) throw new Error("Pick a class");
      const { error } = await supabase.from("sections").insert({
        name: secName, class_id: secClass, school_id: profile.school_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Section added");
      setOpenSec(false); setSecName(""); setSecClass("");
      qc.invalidateQueries({ queryKey: ["sections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Section deleted");
      qc.invalidateQueries({ queryKey: ["sections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader title="Classes & Sections" subtitle="Organize your school structure." />

      <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Classes</h2>
          {isAdmin && (
            <Dialog open={openClass} onOpenChange={setOpenClass}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add class</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New class</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2"><Label>Class name</Label><Input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. Grade 5" /></div>
                  <div className="space-y-2"><Label>Grade level (optional)</Label><Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. 5" /></div>
                </div>
                <DialogFooter>
                  <Button onClick={() => addClass.mutate()} disabled={!className || addClass.isPending}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <EntityTable
          rows={classesQ.data ?? []}
          loading={classesQ.isLoading}
          columns={[
            { key: "name", label: "Name" },
            { key: "grade_level", label: "Grade" },
          ]}
          onDelete={isAdmin ? (id) => delClass.mutate(id) : undefined}
          empty="No classes yet."
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sections</h2>
          {isAdmin && (
            <Dialog open={openSec} onOpenChange={setOpenSec}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add section</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New section</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select value={secClass} onValueChange={setSecClass}>
                      <SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger>
                      <SelectContent>
                        {(classesQ.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Section name</Label><Input value={secName} onChange={(e) => setSecName(e.target.value)} placeholder="e.g. A" /></div>
                </div>
                <DialogFooter>
                  <Button onClick={() => addSection.mutate()} disabled={!secName || !secClass || addSection.isPending}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <EntityTable
          rows={(sectionsQ.data ?? []).map((s) => ({
            ...s,
            class_name: classesQ.data?.find((c) => c.id === s.class_id)?.name ?? "—",
          }))}
          loading={sectionsQ.isLoading}
          columns={[
            { key: "name", label: "Section" },
            { key: "class_name", label: "Class" },
          ]}
          onDelete={isAdmin ? (id) => delSection.mutate(id) : undefined}
          empty="No sections yet."
        />
      </section>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function EntityTable<T extends { id: string }>({
  rows, columns, loading, onDelete, empty,
}: {
  rows: T[];
  columns: { key: keyof T | string; label: string }[];
  loading?: boolean;
  onDelete?: (id: string) => void;
  empty: string;
}) {
  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            {columns.map((c) => <th key={String(c.key)} className="py-2 pr-4 font-medium">{c.label}</th>)}
            {onDelete && <th className="py-2 text-right" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              {columns.map((c) => (
                <td key={String(c.key)} className="py-3 pr-4">{String((r as Record<string, unknown>)[c.key as string] ?? "—")}</td>
              ))}
              {onDelete && (
                <td className="py-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
