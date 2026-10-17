import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { listHomework, getHomeworkScope } from "@/lib/homework.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/homework/reports")({
  component: HomeworkReportsPage,
});

function HomeworkReportsPage() {
  const list = useServerFn(listHomework);
  const fetchScope = useServerFn(getHomeworkScope);

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400_000);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const { data: scope } = useQuery({
    queryKey: ["homework-scope"],
    queryFn: () => fetchScope(),
  });

  const sections = useMemo(
    () => (scope?.sections ?? []).filter((s) => !classId || s.class_id === classId),
    [scope, classId],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["hw-list-all", from, to, classId, sectionId],
    queryFn: () =>
      list({
        data: {
          from: from || null,
          to: to || null,
          classId: classId || null,
          sectionId: sectionId || null,
        },
      }),
  });

  const rows = data?.rows ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = rows.filter((r) => r.due_date < todayStr).length;
  const dueToday = rows.filter((r) => r.due_date === todayStr).length;
  const upcoming = rows.filter((r) => r.due_date > todayStr).length;

  const bySubject: Record<string, number> = {};
  const byClass: Record<string, number> = {};
  rows.forEach((r) => {
    bySubject[r.subject] = (bySubject[r.subject] ?? 0) + 1;
    byClass[r.class_name] = (byClass[r.class_name] ?? 0) + 1;
  });

  const exportCsv = () => {
    const head = ["Title", "Subject", "Class", "Section", "Assigned", "Due", "Status", "Created By"];
    const lines = [head.join(",")].concat(
      rows.map((r) =>
        [r.title, r.subject, r.class_name, r.section_name, r.assigned_date, r.due_date, r.status, r.teacher_name]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `homework-${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Class</label>
            <Select
              value={classId || "all"}
              onValueChange={(v) => {
                setClassId(v === "all" ? "" : v);
                setSectionId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(scope?.classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Section</label>
            <Select
              value={sectionId || "all"}
              onValueChange={(v) => setSectionId(v === "all" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setFrom(monthAgo.toISOString().slice(0, 10));
                setTo(todayStr);
                setClassId("");
                setSectionId("");
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat label="Total" v={rows.length} />
        <Stat label="Overdue" v={overdue} tone="rose" />
        <Stat label="Due Today" v={dueToday} tone="amber" />
        <Stat label="Upcoming" v={upcoming} tone="sky" />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Subject</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {Object.entries(bySubject)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <li key={k} className="flex justify-between">
                        <span>{k}</span>
                        <span className="font-medium">{v}</span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By Class</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {Object.entries(byClass)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <li key={k} className="flex justify-between">
                        <span>{k}</span>
                        <span className="font-medium">{v}</span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              <span className="ml-1.5">Export CSV</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, v, tone }: { label: string; v: number; tone?: "rose" | "amber" | "sky" }) {
  const cls =
    tone === "rose"
      ? "text-rose-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "sky"
          ? "text-sky-600"
          : "text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${cls}`}>{v}</p>
    </div>
  );
}
