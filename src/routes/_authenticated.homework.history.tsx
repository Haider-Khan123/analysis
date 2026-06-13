import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getHomeworkScope, listHomework } from "@/lib/homework.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/homework/history")({
  component: HomeworkHistoryPage,
});

function HomeworkHistoryPage() {
  const fetchScope = useServerFn(getHomeworkScope);
  const list = useServerFn(listHomework);

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 90 * 86400_000);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [subject, setSubject] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const { data: scope } = useQuery({ queryKey: ["hw-scope"], queryFn: () => fetchScope() });
  const sections = useMemo(
    () => (scope?.sections ?? []).filter((s) => !classId || s.class_id === classId),
    [scope, classId],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["hw-history", from, to, subject, classId, sectionId],
    queryFn: () => list({ data: { from, to, subject: subject || null, classId: classId || null, sectionId: sectionId || null } }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
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
            <label className="mb-1 block text-xs text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Math" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Class</label>
            <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {(scope?.classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Section</label>
            <Select value={sectionId || "all"} onValueChange={(v) => setSectionId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">History ({data?.rows.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Teacher</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No records.</TableCell></TableRow>
                  ) : (data?.rows ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell>{r.subject}</TableCell>
                      <TableCell>{r.assigned_date}</TableCell>
                      <TableCell>{r.due_date}</TableCell>
                      <TableCell>{r.class_name}</TableCell>
                      <TableCell>{r.section_name}</TableCell>
                      <TableCell>{r.teacher_name}</TableCell>
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
