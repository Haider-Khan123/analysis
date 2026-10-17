import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getParentProgress } from "@/lib/progress.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/parent-progress")({
  component: ParentProgressPage,
});

function ParentProgressPage() {
  const fetch = useServerFn(getParentProgress);
  const [studentId, setStudentId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["parent-progress", studentId, from, to],
    queryFn: () => fetch({ data: { studentId: studentId || null, from: from || null, to: to || null } }),
  });

  const dateSelected = !!(from || to);
  const rows = data?.rows ?? [];
  const latestAcademic = rows.filter((r) => r.type === "academic").slice(0, 3);
  const latestBehavior = rows.filter((r) => r.type === "behavior").slice(0, 3);
  const latestParticipation = rows.filter((r) => r.type === "participation").slice(0, 3);
  const latestRemarks = rows.slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Student Progress</h1>
        <p className="text-sm text-muted-foreground">Teacher feedback, behavior, participation, and academic remarks.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Child</label>
            <Select value={studentId || "all"} onValueChange={(v) => setStudentId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All children</SelectItem>
                {(data?.children ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {!dateSelected ? (
        <p className="text-sm text-muted-foreground">Select a date range to view progress records.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Section title="Latest Teacher Remarks" rows={latestRemarks} />
            <Section title="Latest Academic Feedback" rows={latestAcademic} />
            <Section title="Recent Behavior" rows={latestBehavior} />
            <Section title="Participation Summary" rows={latestParticipation} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Progress Timeline ({rows.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {rows.length === 0 ? <p className="text-sm text-muted-foreground">No progress records.</p> : rows.map((r) => (
                <div key={r.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{r.record_date} · {r.student_name} · {r.teacher_name}</p>
                    <Badge variant="outline" className="capitalize">{r.type}</Badge>
                  </div>
                  {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                  {r.subject && <p className="text-xs text-muted-foreground">{r.subject}</p>}
                  {r.notes && <p className="mt-1">{r.notes}</p>}
                  {r.behavior && <p className="mt-1 text-xs capitalize">Behavior: {r.behavior.replace("_", " ")}</p>}
                  {r.participation && <p className="text-xs capitalize">Participation: {r.participation.replace("_", " ")}</p>}
                  {(r.strengths || r.improvements) && (
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs md:grid-cols-2">
                      {r.strengths && <div><span className="font-medium text-emerald-700">Strengths:</span> {r.strengths}</div>}
                      {r.improvements && <div><span className="font-medium text-amber-700">Improve:</span> {r.improvements}</div>}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Array<{ id: string; record_date: string; title: string | null; notes: string | null; subject: string | null; behavior: string | null; participation: string | null }> }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.length === 0 ? <p className="text-muted-foreground">No records yet.</p> : rows.map((r) => (
          <div key={r.id} className="rounded-md border border-border p-2">
            <p className="text-xs text-muted-foreground">{r.record_date}{r.subject ? ` · ${r.subject}` : ""}</p>
            {r.title && <p className="font-medium">{r.title}</p>}
            {r.notes && <p>{r.notes}</p>}
            {r.behavior && <p className="text-xs capitalize">{r.behavior.replace("_", " ")}</p>}
            {r.participation && <p className="text-xs capitalize">{r.participation.replace("_", " ")}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
