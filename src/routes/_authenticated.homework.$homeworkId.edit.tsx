import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getHomeworkDetail, updateHomework } from "@/lib/homework.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/homework/$homeworkId/edit")({
  component: EditHomeworkPage,
});

function EditHomeworkPage() {
  const { homeworkId } = Route.useParams();
  const navigate = useNavigate();
  const fetchDetail = useServerFn(getHomeworkDetail);
  const update = useServerFn(updateHomework);

  const { data, isLoading } = useQuery({
    queryKey: ["hw-detail", homeworkId],
    queryFn: () => fetchDetail({ data: { id: homeworkId } }),
  });

  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedDate, setAssignedDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!data?.ok) return;
    const h = data.homework;
    setSubject(h.subject ?? "");
    setTitle(h.title ?? "");
    setDescription(h.description ?? "");
    setAssignedDate(h.assigned_date ?? "");
    setDueDate(h.due_date ?? "");
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => update({ data: { id: homeworkId, subject, title, description: description || null, assignedDate, dueDate } }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Updated"); navigate({ to: "/homework/list" });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.ok) return <p className="text-sm text-destructive">Not found</p>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Edit Homework</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Description</label>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Assigned</label>
            <Input type="date" value={assignedDate} onChange={(e) => setAssignedDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Due</label>
            <Input type="date" value={dueDate} min={assignedDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/homework/list" })}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}
