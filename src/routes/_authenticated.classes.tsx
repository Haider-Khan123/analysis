import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCurrentSchool } from "@/lib/use-current-school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/classes")({
  head: () => ({ meta: [{ title: "Classes & Sections — Analysis" }] }),
  component: ClassesPage,
});

const CLASS_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));

function ClassesPage() {
  const { roles } = useAuth();
  const { schoolId, schoolName } = useCurrentSchool();
  const isAdmin = roles.includes("admin") || roles.length === 0;
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

  // Dedupe classes by name for dropdowns / display
  const uniqueClasses = useMemo(() => {
    const seen = new Set<string>();
    return (classesQ.data ?? []).filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    }).sort((a, b) => Number(a.name) - Number(b.name) || a.name.localeCompare(b.name));
  }, [classesQ.data]);

  const usedClassNames = useMemo(() => new Set(uniqueClasses.map((c) => c.name)), [uniqueClasses]);

  const [openClass, setOpenClass] = useState(false);
  const [className, setClassName] = useState("");

  const addClass = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No institute found. Please create it in School Profile first.");
      if (usedClassNames.has(className)) throw new Error("This class already exists.");
      const { error } = await supabase.from("classes").insert({
        name: className, grade_level: className, school_id: schoolId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Class added");
      setOpenClass(false); setClassName("");
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
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
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [openSec, setOpenSec] = useState(false);
  const [secName, setSecName] = useState("");
  const [secClass, setSecClass] = useState("");

  const addSection = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No institute found. Please create it in School Profile first.");
      if (!secClass) throw new Error("Pick a class");
      const { error } = await supabase.from("sections").insert({
        name: secName, class_id: secClass, school_id: schoolId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Section added");
      setOpenSec(false); setSecName(""); setSecClass("");
      qc.invalidateQueries({ queryKey: ["sections"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
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
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();

  const filteredClasses = useMemo(
    () => (term ? uniqueClasses.filter((c) => c.name.toLowerCase().includes(term)) : uniqueClasses),
    [uniqueClasses, term],
  );

  const sectionsWithClass = useMemo(
    () => (sectionsQ.data ?? []).map((s) => ({
      ...s,
      class_name: classesQ.data?.find((c) => c.id === s.class_id)?.name ?? "—",
    })),
    [sectionsQ.data, classesQ.data],
  );

  const filteredSections = useMemo(
    () => (term
      ? sectionsWithClass.filter((s) =>
          s.name.toLowerCase().includes(term) || s.class_name.toLowerCase().includes(term))
      : sectionsWithClass),
    [sectionsWithClass, term],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Classes & Sections" subtitle="Organize your school structure." />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search classes or sections…"
          className="pl-9"
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Classes</h2>
          {isAdmin && (
            <Dialog open={openClass} onOpenChange={(o) => { setOpenClass(o); if (!o) setClassName(""); }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add class</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New class</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Institute</Label>
                    <Input value={schoolName ?? "Loading institute…"} readOnly disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select value={className} onValueChange={setClassName}>
                      <SelectTrigger><SelectValue placeholder="Select a class (1–12)" /></SelectTrigger>
                      <SelectContent>
                        {CLASS_OPTIONS.map((n) => (
                          <SelectItem key={n} value={n} disabled={usedClassNames.has(n)}>
                            {n}{usedClassNames.has(n) ? " (already added)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => addClass.mutate()} disabled={!className || !schoolId || addClass.isPending}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <ScrollArea className="max-h-[360px] pr-2">
          <EntityTable
            rows={filteredClasses}
            loading={classesQ.isLoading}
            columns={[
              { key: "name", label: "Class" },
              { key: "grade_level", label: "Grade" },
            ]}
            onDelete={isAdmin ? (id) => delClass.mutate(id) : undefined}
            empty={term ? "No matching classes." : "No classes yet."}
          />
        </ScrollArea>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sections</h2>
          {isAdmin && (
            <Dialog open={openSec} onOpenChange={(o) => { setOpenSec(o); if (!o) { setSecName(""); setSecClass(""); } }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add section</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New section</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Institute</Label>
                    <Input value={schoolName ?? "Loading institute…"} readOnly disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select value={secClass} onValueChange={setSecClass}>
                      <SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger>
                      <SelectContent>
                        {uniqueClasses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Section name</Label><Input value={secName} onChange={(e) => setSecName(e.target.value)} placeholder="e.g. A" /></div>
                </div>
                <DialogFooter>
                  <Button onClick={() => addSection.mutate()} disabled={!secName || !secClass || !schoolId || addSection.isPending}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <ScrollArea className="max-h-[360px] pr-2">
          <EntityTable
            rows={filteredSections}
            loading={sectionsQ.isLoading}
            columns={[
              { key: "name", label: "Section" },
              { key: "class_name", label: "Class" },
            ]}
            onDelete={isAdmin ? (id) => delSection.mutate(id) : undefined}
            empty={term ? "No matching sections." : "No sections yet."}
          />
        </ScrollArea>
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
  rows, columns, loading, onDelete, actions, empty,
}: {
  rows: T[];
  columns: { key: keyof T | string; label: string }[];
  loading?: boolean;
  onDelete?: (id: string) => void;
  actions?: (row: T) => React.ReactNode;
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
            {(actions || onDelete) && <th className="py-2 text-right" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              {columns.map((c) => (
                <td key={String(c.key)} className="py-3 pr-4">{String((r as Record<string, unknown>)[c.key as string] ?? "—")}</td>
              ))}
              {(actions || onDelete) && (
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {actions?.(r)}
                    {onDelete && (
                      <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
