import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { listHomework } from "@/lib/homework.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/homework/reports")({
  component: HomeworkReportsPage,
});

function HomeworkReportsPage() {
  const list = useServerFn(listHomework);
  const { data } = useQuery({ queryKey: ["hw-list-all"], queryFn: () => list({ data: {} }) });

  const rows = data?.rows ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const overdue = rows.filter((r) => r.due_date < today).length;
  const dueToday = rows.filter((r) => r.due_date === today).length;
  const upcoming = rows.filter((r) => r.due_date > today).length;

  const bySubject: Record<string, number> = {};
  const byClass: Record<string, number> = {};
  rows.forEach((r) => {
    bySubject[r.subject] = (bySubject[r.subject] ?? 0) + 1;
    byClass[r.class_name] = (byClass[r.class_name] ?? 0) + 1;
  });

  const exportCsv = () => {
    const head = ["Title", "Subject", "Class", "Section", "Assigned", "Due", "Status", "Created By"];
    const lines = [head.join(",")].concat(
      rows.map((r) => [r.title, r.subject, r.class_name, r.section_name, r.assigned_date, r.due_date, r.status, r.teacher_name]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `homework-${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat label="Total" v={rows.length} />
        <Stat label="Overdue" v={overdue} tone="rose" />
        <Stat label="Due Today" v={dueToday} tone="amber" />
        <Stat label="Upcoming" v={upcoming} tone="sky" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">By Subject</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {Object.entries(bySubject).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k} className="flex justify-between"><span>{k}</span><span className="font-medium">{v}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">By Class</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k} className="flex justify-between"><span>{k}</span><span className="font-medium">{v}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4" /><span className="ml-1.5">Export CSV</span>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, v, tone }: { label: string; v: number; tone?: "rose" | "amber" | "sky" }) {
  const cls = tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : tone === "sky" ? "text-sky-600" : "text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${cls}`}>{v}</p>
    </div>
  );
}
