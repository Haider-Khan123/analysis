import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone, Paperclip } from "lucide-react";
import { listAnnouncements, getAnnouncementDetail } from "@/lib/announcements.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/announcements/view")({
  head: () => ({ meta: [{ title: "View Announcements" }] }),
  component: ViewAnnouncementsPage,
});

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  medium: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgent: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

function ViewAnnouncementsPage() {
  const list = useServerFn(listAnnouncements);
  const detail = useServerFn(getAnnouncementDetail);
  const [type, setType] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ann-view", type, from, to, q],
    queryFn: () => list({ data: {
      status: "published",
      type: type === "all" ? null : (type as never),
      from: from || null, to: to || null, q: q || null,
    } }),
  });

  const { data: detailData } = useQuery({
    queryKey: ["ann-view-detail", viewId],
    queryFn: () => detail({ data: { id: viewId! } }),
    enabled: !!viewId,
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">View Announcements</h1>
        <p className="text-sm text-muted-foreground">Browse all published announcements in detail.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filter</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <Label>Search</Label>
              <Input className="mt-1" placeholder="Title…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="school_wide">School-Wide</SelectItem>
                  <SelectItem value="class_specific">Class-Specific</SelectItem>
                </SelectContent>
              </Select>
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
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No announcements yet.</p>
        ) : (
          rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setViewId(r.id)}
              className="w-full text-left rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.type === "school_wide" ? "School-Wide" : "Class Announcement"} ·{" "}
                      {r.publish_at ? new Date(r.publish_at).toLocaleString() : ""} · by {r.creator_name}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={PRIORITY_STYLE[r.priority] + " capitalize"}>{r.priority}</Badge>
              </div>
              <p className="mt-3 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{r.description}</p>
            </button>
          ))
        )}
      </div>

      <Dialog open={!!viewId} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailData?.ok ? detailData.announcement.title : "Loading…"}</DialogTitle>
            <DialogDescription>
              {detailData?.ok ? `${detailData.announcement.category.replace(/_/g, " ")} · ${detailData.announcement.priority}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detailData?.ok && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {detailData.announcement.publish_at ? new Date(detailData.announcement.publish_at).toLocaleString() : ""}
              </p>
              <p className="whitespace-pre-wrap">{detailData.announcement.description}</p>
              {detailData.attachments.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Attachments</p>
                  <ul className="space-y-1">
                    {detailData.attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-2">
                        <Paperclip className="h-3 w-3" />
                        {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="text-primary underline">{a.file_name}</a> : a.file_name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
