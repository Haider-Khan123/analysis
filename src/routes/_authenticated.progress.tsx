import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Check } from "lucide-react";
import { getProgressScope, submitProgressBatch } from "@/lib/progress.functions";
import { ProgressEntryProvider, useProgressEntry, entryStatus } from "@/lib/progress-entry-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/progress")({
  component: ProgressLayout,
});

function ProgressLayout() {
  return (
    <ProgressEntryProvider>
      <ProgressInner />
    </ProgressEntryProvider>
  );
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function ProgressInner() {
  const { pathname } = useLocation();
  const tabs = [
    { to: "/progress/observations", label: "Daily Observations", key: "observation" as const },
    { to: "/progress/behavior", label: "Behavior", key: "behavior" as const },
    { to: "/progress/participation", label: "Participation", key: "participation" as const },
    { to: "/progress/academic", label: "Academic Remarks", key: "academic" as const },
    { to: "/progress/history", label: "Progress History", key: null },
    { to: "/progress/reports", label: "Reports", key: null },
  ];

  const fetchScope = useServerFn(getProgressScope);
  const submit = useServerFn(submitProgressBatch);
  const qc = useQueryClient();
  const ctx = useProgressEntry();
  const { data: scope } = useQuery({ queryKey: ["progress-scope"], queryFn: () => fetchScope() });

  const sections = useMemo(
    () => (scope?.sections ?? []).filter((s) => !ctx.classId || s.class_id === ctx.classId),
    [scope, ctx.classId],
  );
  const students = useMemo(
    () => (scope?.students ?? []).filter((s) =>
      (!ctx.classId || s.class_id === ctx.classId) && (!ctx.sectionId || s.section_id === ctx.sectionId)),
    [scope, ctx.classId, ctx.sectionId],
  );

  const status = entryStatus(ctx.studentId, ctx.entry);
  const isEntryTab = pathname.startsWith("/progress/observations")
    || pathname.startsWith("/progress/behavior")
    || pathname.startsWith("/progress/participation")
    || pathname.startsWith("/progress/academic");

  const mutation = useMutation({
    mutationFn: () => submit({
      data: {
        studentId: ctx.studentId,
        recordDate: ctx.recordDate,
        observation: { title: ctx.entry.observation.title || null, notes: ctx.entry.observation.notes || null },
        behavior: { behavior: ctx.entry.behavior.behavior as "excellent" | "good" | "average" | "needs_improvement", notes: ctx.entry.behavior.notes || null },
        participation: { participation: ctx.entry.participation.participation as "highly_active" | "active" | "moderate" | "passive", notes: ctx.entry.participation.notes || null },
        academic: {
          subject: ctx.entry.academic.subject,
          title: ctx.entry.academic.title || null,
          notes: ctx.entry.academic.notes || null,
          strengths: ctx.entry.academic.strengths || null,
          improvements: ctx.entry.academic.improvements || null,
        },
      },
    }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Record has been submitted.");
      ctx.resetAll();
      ["progress-observation", "progress-behavior", "progress-participation", "progress-academic", "progress-history"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }));
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Student Progress Tracking</h1>
        <p className="text-sm text-muted-foreground">Pick a student, then fill all four sections to submit a record.</p>
      </div>

      {isEntryTab && (
        <Card>
          <CardHeader><CardTitle className="text-base">Student</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Class</label>
              <Select value={ctx.classId || "all"} onValueChange={(v) => { ctx.setClassId(v === "all" ? "" : v); ctx.setSectionId(""); ctx.setStudentId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {(scope?.classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Section</label>
              <Select value={ctx.sectionId || "all"} onValueChange={(v) => { ctx.setSectionId(v === "all" ? "" : v); ctx.setStudentId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Student *</label>
              <Select value={ctx.studentId} onValueChange={ctx.setStudentId}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Date *</label>
              <Input type="date" value={ctx.recordDate} max={todayStr()} onChange={(e) => ctx.setRecordDate(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.to);
          const filled = t.key ? (status as Record<string, boolean>)[t.key] : false;
          return (
            <Link key={t.to} to={t.to}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}>
              {t.label}
              {t.key && filled && <Check className={cn("h-3.5 w-3.5", active ? "" : "text-emerald-600")} />}
            </Link>
          );
        })}
      </div>

      <Outlet />

      {isEntryTab && (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {ctx.studentId ? "Sections: " : "Select a student to begin."}
              {ctx.studentId && (
                <span className="ml-1">
                  <Pill ok={status.observation} label="Observation" />
                  <Pill ok={status.behavior} label="Behavior" />
                  <Pill ok={status.participation} label="Participation" />
                  <Pill ok={status.academic} label="Academic" />
                </span>
              )}
            </div>
            <Button disabled={!status.allReady || mutation.isPending} onClick={() => mutation.mutate()}>
              <Send className="h-4 w-4" /><span className="ml-1.5">Submit Record</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
      ok ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground")}>
      {ok && <Check className="h-3 w-3" />}{label}
    </span>
  );
}
