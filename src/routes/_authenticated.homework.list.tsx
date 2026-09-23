import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { listHomework, deleteHomework, getHomeworkDetail } from "@/lib/homework.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getUserErrorMessage } from "@/lib/user-error";

export const Route = createFileRoute("/_authenticated/homework/list")({
  component: HomeworkListPage,
});

const STATUS: Record<string, string> = {
  overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  due_today: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  upcoming: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

function HomeworkListPage() {
  const list = useServerFn(listHomework);
  const del = useServerFn(deleteHomework);
  const detail = useServerFn(getHomeworkDetail);
  const qc = useQueryClient();

  const [viewId, setViewId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["hw-list"],
    queryFn: () => list({ data: {} }),
  });

  const { data: detailData } = useQuery({
    queryKey: ["hw-detail", viewId],
    queryFn: () => detail({ data: { id: viewId! } }),
    enabled: !!viewId,
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(getUserErrorMessage(res.error)); return; }
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["hw-list"] });
    },
  });

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Homework ({data?.rows.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">No homework yet.</TableCell></TableRow>
                  ) : (data?.rows ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell>{r.subject}</TableCell>
                      <TableCell>{r.class_name}</TableCell>
                      <TableCell>{r.section_name}</TableCell>
                      <TableCell>{r.assigned_date}</TableCell>
                      <TableCell>{r.due_date}</TableCell>
                      <TableCell><Badge variant="outline" className={STATUS[r.status] + " capitalize"}>{r.status.replace("_", " ")}</Badge></TableCell>
                      <TableCell className="text-sm">{r.teacher_name}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setViewId(r.id)}><Eye className="h-4 w-4" /></Button>
                          {r.can_edit && (
                            <>
                              <Button asChild size="sm" variant="ghost">
                                <Link to="/homework/$homeworkId/edit" params={{ homeworkId: r.id }}><Pencil className="h-4 w-4" /></Link>
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this homework?")) delMutation.mutate(r.id); }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
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
            <DialogTitle>{detailData?.ok ? detailData.homework.title : "Loading…"}</DialogTitle>
            <DialogDescription>{detailData?.ok ? `${detailData.homework.subject} · Due ${detailData.homework.due_date}` : ""}</DialogDescription>
          </DialogHeader>
          {detailData?.ok && (
            <div className="space-y-3 text-sm">
              {detailData.homework.description && <p className="whitespace-pre-wrap">{detailData.homework.description}</p>}
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
