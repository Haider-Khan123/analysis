import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone, Paperclip } from "lucide-react";
import { getParentAnnouncements, markAnnouncementRead } from "@/lib/announcements.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/parent-announcements")({
  head: () => ({ meta: [{ title: "Announcements" }] }),
  component: ParentAnnouncementsPage,
});

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  medium: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgent: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

function ParentAnnouncementsPage() {
  const fetchFn = useServerFn(getParentAnnouncements);
  const markFn = useServerFn(markAnnouncementRead);
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["parent-ann", studentId, from, to, q],
    queryFn: () => fetchFn({ data: {
      studentId: studentId === "all" ? null : studentId,
      from: from || null, to: to || null, q: q || null,
    } }),
  });

  const markM = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parent-ann"] }),
  });

  // Auto-mark on render
  useEffect(() => {
    const unread = (data?.rows ?? []).filter((r) => !r.is_read).map((r) => r.id);
    if (unread.length) {
      unread.forEach((id) => markM.mutate(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.rows.map((r) => r.id).join(",")]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
        <p className="text-sm text-muted-foreground">Latest announcements from school and your child's class.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filter</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <Label>Child</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All children</SelectItem>
                  {(data?.children ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Search</Label>
              <Input className="mt-1" placeholder="Title…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div>
              <Label>From</Label>
              <Input className="mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>To</Label>
              <Input className="mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (data?.rows ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No announcements yet.</p>
        ) : (
          (data?.rows ?? []).map((r) => (
            <div key={r.id} className={`rounded-xl border p-4 shadow-[var(--shadow-card)] ${r.is_read ? "border-border bg-card" : "border-primary/40 bg-primary/5"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.type === "school_wide" ? "School-Wide" : "Class Announcement"} ·{" "}
                      {r.publish_at ? new Date(r.publish_at).toLocaleString() : ""}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={PRIORITY_STYLE[r.priority] + " capitalize"}>{r.priority}</Badge>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm">{r.description}</p>
              {r.attachments.length > 0 && (
                <div className="mt-3 space-y-1">
                  {r.attachments.map((a) => (
                    <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-xs text-primary underline">
                      <Paperclip className="h-3 w-3" /> {a.file_name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
