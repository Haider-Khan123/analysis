import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProgress, getProgressScope } from "@/lib/progress.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/progress/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const list = useServerFn(listProgress);
  const fetchScope = useServerFn(getProgressScope);

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 90 * 86400_000);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [studentId, setStudentId] = useState("");

  const { data: scope } = useQuery({ queryKey: ["progress-scope"], queryFn: () => fetchScope() });
  const sections = useMemo(() => (scope?.sections ?? []).filter((s) => !classId || s.class_id === classId), [scope, classId]);
  const students = useMemo(
    () => (scope?.students ?? []).filter((s) =>
      (!classId || s.class_id === classId) && (!sectionId || s.section_id === sectionId)),
    [scope, classId, sectionId],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["progress-history", from, to, classId, sectionId, studentId],
    queryFn: () => list({ data: { from, to, classId: classId || null, sectionId: sectionId || null, studentId: studentId || null } }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div><label className="mb-1 block text-xs text-muted-foreground">From</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="mb-1 block text-xs text-muted-foreground">To</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Class</label>
            <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); setStudentId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{(scope?.classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Section</label>
            <Select value={sectionId || "all"} onValueChange={(v) => { setSectionId(v === "all" ? "" : v); setStudentId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Student</label>
            <Select value={studentId || "all"} onValueChange={(v) => setStudentId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Records ({data?.rows.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Teacher</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No records.</TableCell></TableRow>
                  ) : (data?.rows ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.record_date}</TableCell>
                      <TableCell className="font-medium">{r.student_name}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{r.type}</Badge></TableCell>
                      <TableCell className="text-sm">
                        {r.title && <span className="font-medium">{r.title}. </span>}
                        {r.subject && <span className="text-muted-foreground">[{r.subject}] </span>}
                        {r.behavior && <span className="capitalize text-muted-foreground">behavior: {r.behavior.replace("_", " ")}. </span>}
                        {r.participation && <span className="capitalize text-muted-foreground">participation: {r.participation.replace("_", " ")}. </span>}
                        {r.notes && <span>{r.notes}</span>}
                      </TableCell>
                      <TableCell className="text-sm">{r.teacher_name}</TableCell>
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
