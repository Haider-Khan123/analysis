import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, Trash2, Send, Archive } from "lucide-react";
import {
  listAnnouncements, deleteAnnouncement, getAnnouncementDetail, publishAnnouncement, archiveAnnouncement,
} from "@/lib/announcements.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/announcements/history")({
  component: HistoryPage,
});

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  expired: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  archived: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
};
const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  medium: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgent: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

function HistoryPage() {
  const list = useServerFn(listAnnouncements);
  const del = useServerFn(deleteAnnouncement);
  const detail = useServerFn(getAnnouncementDetail);
  const publishFn = useServerFn(publishAnnouncement);
  const archiveFn = useServerFn(archiveAnnouncement);
  const qc = useQueryClient();

  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ann-list", status, type, from, to, q],
    queryFn: () => list({ data: {
      status: status === "all" ? null : status,
      type: type === "all" ? null : (type as never),
      from: from || null, to: to || null, q: q || null,
    } }),
  });

  const { data: detailData } = useQuery({
    queryKey: ["ann-detail", viewId],
    queryFn: () => detail({ data: { id: viewId! } }),
    enabled: !!viewId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ann-list"] });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: (res) => { if (!res.ok) toast.error(res.error); else { toast.success("Deleted"); invalidate(); } },
  });
  const pubM = useMutation({
    mutationFn: (id: string) => publishFn({ data: { id } }),
    onSuccess: (res) => { if (!res.ok) toast.error(res.error); else { toast.success("Published"); invalidate(); } },
  });
  const archM = useMutation({
    mutationFn: (id: string) => archiveFn({ data: { id } }),
    onSuccess: (res) => { if (!res.ok) toast.error(res.error); else { toast.success("Archived"); invalidate(); } },
  });

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Announcement History ({data?.rows.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <Label>Search</Label>
              <Input className="mt-1" placeholder="Title…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
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

          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Publish</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No announcements yet.</TableCell></TableRow>
                  ) : (data?.rows ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell className="text-sm">{r.audience}</TableCell>
                      <TableCell><Badge variant="outline" className={PRIORITY_STYLE[r.priority] + " capitalize"}>{r.priority}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={STATUS_STYLE[r.status] + " capitalize"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{r.publish_at ? new Date(r.publish_at).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-xs">{r.expires_at ? new Date(r.expires_at).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-sm">{r.creator_name}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setViewId(r.id)}><Eye className="h-4 w-4" /></Button>
                          {r.can_edit && r.status !== "published" && r.status !== "archived" && (
                            <Button size="sm" variant="ghost" title="Publish now" onClick={() => pubM.mutate(r.id)}>
                              <Send className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          {r.can_edit && r.status === "published" && (
                            <Button size="sm" variant="ghost" title="Archive" onClick={() => archM.mutate(r.id)}>
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                          {r.can_edit && (
                            <Button size="sm" variant="ghost" title="Delete"
                              onClick={() => { if (confirm("Delete this announcement?")) delM.mutate(r.id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
              <p className="whitespace-pre-wrap">{detailData.announcement.description}</p>
              {detailData.attachments.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Attachments</p>
                  <ul className="space-y-1">
                    {detailData.attachments.map((a) => (
                      <li key={a.id}>
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
    </>
  );
}
