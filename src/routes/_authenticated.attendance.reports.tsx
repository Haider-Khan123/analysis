import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { todayStr } from "@/lib/validators";
import { getAttendancePercentageReport } from "@/lib/attendance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/attendance/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const fetchReport = useServerFn(getAttendancePercentageReport);
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400_000);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["att-pct", from, to],
    queryFn: () => fetchReport({ data: { from, to } }),
  });
  const rows = data?.rows ?? [];

  const exportCsv = () => {
    const head = ["Student Name", "Class Name", "Section Name", "Attendance Percentage"];
    const lines = [head.join(",")].concat(
      rows.map((r) =>
        [r.student_name, r.class_name, r.section_name, `${r.percentage}%`]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance-report-${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Date Range</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} max={todayStr()} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /><span className="ml-1.5">Export CSV</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Attendance Report ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Class Name</TableHead>
                    <TableHead>Section Name</TableHead>
                    <TableHead className="text-right">Attendance Percentage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No records.</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.student_id}>
                      <TableCell className="font-medium">{r.student_name}</TableCell>
                      <TableCell>{r.class_name}</TableCell>
                      <TableCell>{r.section_name}</TableCell>
                      <TableCell className="text-right font-semibold">{r.percentage}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
