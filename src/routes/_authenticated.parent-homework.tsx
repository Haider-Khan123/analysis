import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getParentHomework } from "@/lib/homework.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/parent-homework")({
  component: ParentHomeworkPage,
});

const STATUS: Record<string, string> = {
  overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  due_today: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  upcoming: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

function ParentHomeworkPage() {
  const fetch = useServerFn(getParentHomework);
  const [studentId, setStudentId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["parent-hw", studentId, from, to],
    queryFn: () => fetch({ data: { studentId: studentId || null, subject: null, from: from || null, to: to || null } }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Children's Homework</h1>
        <p className="text-sm text-muted-foreground">Homework assigned to your linked children.</p>
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (data?.rows ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No homework matches the filters.</p>
      ) : (
        <div className="space-y-3">
          {(data?.rows ?? []).map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.subject} · Assigned {r.assigned_date} · Due {r.due_date} · {r.teacher_name}</p>
                  </div>
                  <Badge variant="outline" className={STATUS[r.status] + " capitalize"}>{r.status.replace("_", " ")}</Badge>
                </div>
                {r.description && <p className="whitespace-pre-wrap text-sm">{r.description}</p>}
                {r.attachments.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {r.attachments.map((a) => (
                      <li key={a.id}>
                        {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="text-primary underline">{a.file_name}</a> : a.file_name}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
