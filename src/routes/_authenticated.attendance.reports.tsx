import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import {
  getMarkableScope, getAttendanceHistory, getLowAttendance, getClassAnalytics, getAttendanceSettings,
} from "@/lib/attendance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/attendance/reports")({
  component: ReportsPage,
});

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  return (
    <Tabs defaultValue="daily">
      <TabsList>
        <TabsTrigger value="daily">Daily</TabsTrigger>
        <TabsTrigger value="monthly">Monthly</TabsTrigger>
        <TabsTrigger value="student">Student</TabsTrigger>
        <TabsTrigger value="low">Low Attendance</TabsTrigger>
      </TabsList>
      <TabsContent value="daily"><DailyReport /></TabsContent>
      <TabsContent value="monthly"><MonthlyReport /></TabsContent>
      <TabsContent value="student"><StudentReport /></TabsContent>
      <TabsContent value="low"><LowReport /></TabsContent>
    </Tabs>
  );
}

function useScope() {
  const fetchScope = useServerFn(getMarkableScope);
  return useQuery({ queryKey: ["att-scope"], queryFn: () => fetchScope() });
}

function DailyReport() {
  const fetchHistory = useServerFn(getAttendanceHistory);
  const { data: scope } = useScope();
  const [date, setDate] = useState(today());
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const sections = useMemo(
    () => (scope?.sections ?? []).filter((s) => !classId || s.class_id === classId),
    [scope, classId],
  );
  const { data } = useQuery({
    queryKey: ["rep-daily", date, classId, sectionId],
    queryFn: () => fetchHistory({ data: { from: date, to: date, classId: classId || null, sectionId: sectionId || null } }),
  });
  return (
    <Card className="mt-3">
      <CardHeader><CardTitle className="text-base">Daily Attendance Report</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); }}>
            <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(scope?.classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sectionId || "all"} onValueChange={(v) => setSectionId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => downloadCSV(`daily-${date}.csv`,
            (data?.rows ?? []).map((r) => ({ date: r.attendance_date, student: r.student_name, status: r.status, remarks: r.remarks ?? "", marked_by: r.marked_by_name }))
          )} disabled={!(data?.rows.length)}>
            <Download className="h-4 w-4" /><span className="ml-1.5">Export CSV</span>
          </Button>
        </div>
        <RecordsTable rows={data?.rows ?? []} />
      </CardContent>
    </Card>
  );
}

function MonthlyReport() {
  const fetchHistory = useServerFn(getAttendanceHistory);
  const fetchClass = useServerFn(getClassAnalytics);
  const { data: scope } = useScope();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const from = `${month}-01`;
  const to = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 0).toISOString().slice(0, 10);
  const sections = useMemo(
    () => (scope?.sections ?? []).filter((s) => !classId || s.class_id === classId),
    [scope, classId],
  );
  const { data } = useQuery({
    queryKey: ["rep-monthly", from, to, classId, sectionId],
    queryFn: () => fetchHistory({ data: { from, to, classId: classId || null, sectionId: sectionId || null } }),
  });
  const { data: agg } = useQuery({
    queryKey: ["rep-monthly-agg", from, to, classId, sectionId],
    queryFn: () => fetchClass({ data: { from, to, classId: classId || null, sectionId: sectionId || null } }),
  });
  return (
    <Card className="mt-3">
      <CardHeader><CardTitle className="text-base">Monthly Attendance Report</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); }}>
            <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(scope?.classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sectionId || "all"} onValueChange={(v) => setSectionId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => downloadCSV(`monthly-${month}.csv`,
            (data?.rows ?? []).map((r) => ({ date: r.attendance_date, student: r.student_name, status: r.status, remarks: r.remarks ?? "", marked_by: r.marked_by_name }))
          )} disabled={!(data?.rows.length)}>
            <Download className="h-4 w-4" /><span className="ml-1.5">Export CSV</span>
          </Button>
        </div>
        {agg && (
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <MetricBox label="Total" value={agg.total} />
            <MetricBox label="Present" value={agg.present} />
            <MetricBox label="Absent" value={agg.absent} />
            <MetricBox label="Late" value={agg.late} />
            <MetricBox label="Attendance %" value={`${agg.percentage}%`} />
          </div>
        )}
        <RecordsTable rows={data?.rows ?? []} />
      </CardContent>
    </Card>
  );
}

function StudentReport() {
  const fetchHistory = useServerFn(getAttendanceHistory);
  const [studentId, setStudentId] = useState("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const { data } = useQuery({
    queryKey: ["rep-student", studentId, from, to],
    queryFn: () => fetchHistory({ data: { studentId, from, to } }),
    enabled: studentId.length === 36,
  });
  return (
    <Card className="mt-3">
      <CardHeader><CardTitle className="text-base">Student Attendance Report</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input placeholder="Student ID (UUID)" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="outline" onClick={() => downloadCSV(`student-${studentId.slice(0,8)}.csv`,
            (data?.rows ?? []).map((r) => ({ date: r.attendance_date, status: r.status, remarks: r.remarks ?? "" }))
          )} disabled={!(data?.rows.length)}>
            <Download className="h-4 w-4" /><span className="ml-1.5">Export CSV</span>
          </Button>
        </div>
        <RecordsTable rows={data?.rows ?? []} />
      </CardContent>
    </Card>
  );
}

function LowReport() {
  const fetchLow = useServerFn(getLowAttendance);
  const fetchSettings = useServerFn(getAttendanceSettings);
  const { data: settings } = useQuery({ queryKey: ["att-settings"], queryFn: () => fetchSettings() });
  const [threshold, setThreshold] = useState<number | null>(null);
  const effective = threshold ?? settings?.threshold ?? 75;
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const { data } = useQuery({
    queryKey: ["rep-low", effective, from, to],
    queryFn: () => fetchLow({ data: { threshold: effective, from, to } }),
  });
  return (
    <Card className="mt-3">
      <CardHeader><CardTitle className="text-base">Low Attendance Report</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input type="number" min={0} max={100} value={effective} onChange={(e) => setThreshold(Number(e.target.value))} />
          <Button variant="outline" onClick={() => downloadCSV(`low-attendance.csv`,
            (data?.rows ?? []).map((r) => ({ student: r.student_name, attendance_id: r.attendance_id, percentage: r.percentage, attended: r.attended, total: r.total }))
          )} disabled={!(data?.rows.length)}>
            <Download className="h-4 w-4" /><span className="ml-1.5">Export CSV</span>
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Attendance ID</TableHead><TableHead>Student</TableHead>
              <TableHead>Attended</TableHead><TableHead>Total</TableHead><TableHead>%</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data?.rows ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No students below {effective}%.</TableCell></TableRow>
              ) : (data?.rows ?? []).map((r) => (
                <TableRow key={r.student_id}>
                  <TableCell className="font-mono text-xs">{r.attendance_id ?? "—"}</TableCell>
                  <TableCell className="font-medium">{r.student_name}</TableCell>
                  <TableCell>{r.attended}</TableCell>
                  <TableCell>{r.total}</TableCell>
                  <TableCell className="font-semibold text-destructive">{r.percentage}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function RecordsTable({ rows }: { rows: Array<{ id: string; attendance_date: string; student_name: string; status: string; remarks: string | null; marked_by_name: string }> }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Date</TableHead><TableHead>Student</TableHead>
          <TableHead>Status</TableHead><TableHead>Remarks</TableHead><TableHead>Marked By</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No records.</TableCell></TableRow>
          ) : rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.attendance_date}</TableCell>
              <TableCell className="font-medium">{r.student_name}</TableCell>
              <TableCell className="capitalize">{r.status}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.remarks || "—"}</TableCell>
              <TableCell className="text-sm">{r.marked_by_name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
