import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, ArrowLeft } from "lucide-react";
import { getAnnouncementDetail, updateAnnouncement } from "@/lib/announcements.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { getUserErrorMessage } from "@/lib/user-error";
export const Route = createFileRoute("/_authenticated/announcements/$id/edit")({
  component: EditAnnouncementPage,
});

const CATEGORIES = [
  { v: "school_closure", l: "School Closure" },
  { v: "public_holiday", l: "Public Holiday" },
  { v: "sports_day", l: "Sports Day" },
  { v: "parent_teacher_meeting", l: "Parent-Teacher Meeting" },
  { v: "exam_schedule", l: "Examination Schedule" },
  { v: "homework_reminder", l: "Homework Reminder" },
  { v: "class_test", l: "Class Test Notice" },
  { v: "field_trip", l: "Field Trip" },
  { v: "project_submission", l: "Project Submission" },
  { v: "other", l: "Other" },
];

function EditAnnouncementPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const fetchDetail = useServerFn(getAnnouncementDetail);
  const update = useServerFn(updateAnnouncement);

  const { data, isLoading } = useQuery({
    queryKey: ["ann-detail", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [publishAt, setPublishAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    if (!data?.ok) return;
    const a = data.announcement;
    setTitle(a.title ?? "");
    setDescription(a.description ?? "");
    setCategory(a.category ?? "other");
    setPriority(a.priority ?? "medium");
    setPublishAt(
      a.publish_at
        ? new Date(new Date(a.publish_at).getTime() - new Date().getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : "",
    );
    setExpiresAt(
      a.expires_at
        ? new Date(new Date(a.expires_at).getTime() - new Date().getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : "",
    );
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      update({
        data: {
          id,
          title,
          description,
          category: category as never,
          priority,
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(getUserErrorMessage(res.error)); return; }
      toast.success("Announcement updated");
      navigate({ to: "/announcements/history" });
    },
    onError: (e: unknown) => toast.error(getUserErrorMessage(e)),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.ok) return <p className="text-sm text-destructive">Not found</p>;

  const a = data.announcement;
  const canEdit = isAdmin || true; // server fn already guards; UI allows attempt

  const audienceLabel =
    a.type === "school_wide"
      ? "School-Wide"
      : `${a.class_id ? "Class" : ""}${a.section_id ? " · Section" : ""}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/announcements/history"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <CardTitle className="text-base flex items-center gap-2">
          <Pencil className="h-4 w-4" /> Edit Announcement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="capitalize">{a.type.replace("_", "-")}</Badge>
          <Badge variant="outline" className="capitalize">{a.status}</Badge>
          {a.priority && <Badge variant="outline" className="capitalize">{a.priority}</Badge>}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>Title *</Label>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={200} />
          </div>
          <div>
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Description *</Label>
          <Textarea className="mt-1" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detailed announcement message…" maxLength={5000} />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label>Priority *</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as never)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Publish Date</Label>
            <Input type="datetime-local" className="mt-1" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
          </div>
          <div>
            <Label>Expiry Date</Label>
            <Input type="datetime-local" className="mt-1" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>

        {data.attachments.length > 0 && (
          <div>
            <Label>Attachments</Label>
            <ul className="mt-1 space-y-1">
              {data.attachments.map((att) => (
                <li key={att.id} className="text-xs">
                  {att.url ? (
                    <a href={att.url} target="_blank" rel="noreferrer" className="text-primary underline">{att.file_name}</a>
                  ) : (
                    att.file_name
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/announcements/history" })}>Cancel</Button>
          <Button
            disabled={!title.trim() || !description.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
