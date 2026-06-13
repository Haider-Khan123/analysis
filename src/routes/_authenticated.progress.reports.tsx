import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { listProgress } from "@/lib/progress.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/progress/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const list = useServerFn(listProgress);
  const { data } = useQuery({ queryKey: ["progress-all"], queryFn: () => list({ data: {} }) });
  const rows = data?.rows ?? [];
  const byType: Record<string, number> = {};
  const byStudent: Record<string, number> = {};
  rows.forEach((r) => {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    byStudent[r.student_name] = (byStudent[r.student_name] ?? 0) + 1;
  });
  const today = new Date().toISOString().slice(0, 10);

  const exportCsv = () => {
    const head = ["Date", "Student", "Type", "Subject", "Title", "Notes", "Behavior", "Participation", "Teacher"];
    const lines = [head.join(",")].concat(
      rows.map((r) => [r.record_date, r.student_name, r.type, r.subject ?? "", r.title ?? "", r.notes ?? "", r.behavior ?? "", r.participation ?? "", r.teacher_name]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `progress-${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total Records" v={rows.length} />
        <Stat label="Observations" v={byType.observation ?? 0} />
        <Stat label="Behavior" v={byType.behavior ?? 0} />
        <Stat label="Academic" v={byType.academic ?? 0} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Records per Student</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {Object.entries(byStudent).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([k, v]) => (
              <li key={k} className="flex justify-between border-b border-border py-1 last:border-0">
                <span>{k}</span><span className="font-medium">{v}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4" /><span className="ml-1.5">Export CSV</span>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold text-primary">{v}</p>
    </div>
  );
}
