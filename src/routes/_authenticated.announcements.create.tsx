import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, X, Send } from "lucide-react";
import { getAnnouncementScope, createAnnouncement } from "@/lib/announcements.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUserErrorMessage } from "@/lib/user-error";

export const Route = createFileRoute("/_authenticated/announcements/create")({
  component: CreateAnnouncementPage,
});

const ALLOWED = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
];

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

type PendingAttachment = { file: File; path?: string; uploading?: boolean; error?: string };

function CreateAnnouncementPage() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const navigate = useNavigate();
  const fetchScope = useServerFn(getAnnouncementScope);
  const create = useServerFn(createAnnouncement);

  const { data: scope } = useQuery({ queryKey: ["ann-scope"], queryFn: () => fetchScope() });

  const [type, setType] = useState<"school_wide" | "class_specific">("school_wide");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [publishAt, setPublishAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [files, setFiles] = useState<PendingAttachment[]>([]);

  const availableSections = useMemo(
    () => (scope?.sections ?? []).filter((s) => !classId || s.class_id === classId),
    [scope, classId],
  );

  const onPickFiles = async (list: FileList | null) => {
    if (!list || !user) return;
    const valid: PendingAttachment[] = [];
    for (const f of Array.from(list)) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} exceeds 10MB`); continue; }
      if (!ALLOWED.includes(f.type) && !/\.(pdf|docx?|xlsx?|png|jpe?g|gif|webp)$/i.test(f.name)) {
        toast.error(`${f.name} not supported`); continue;
      }
      valid.push({ file: f, uploading: true });
    }
    setFiles((p) => [...p, ...valid]);
    for (const pending of valid) {
      const path = `${user.id}/${Date.now()}-${pending.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("announcement-attachments").upload(path, pending.file, { contentType: pending.file.type || undefined });
      setFiles((p) => p.map((x) => x.file === pending.file ? { ...x, uploading: false, path: error ? undefined : path, error: error ? getUserErrorMessage(error, "File upload failed. Please try again.") : undefined } : x));
    }
  };

  const removeFile = async (idx: number) => {
    const f = files[idx];
    if (f.path) await supabase.storage.from("announcement-attachments").remove([f.path]);
    setFiles((p) => p.filter((_, i) => i !== idx));
  };

  const mutation = useMutation({
    mutationFn: () => create({
      data: {
        type, title, description, category: category as never, priority,
        classId: type === "class_specific" ? classId : null,
        sectionId: type === "class_specific" ? (sectionId || null) : null,
        publishAt: scheduleMode === "later" && publishAt ? new Date(publishAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        publishImmediately: scheduleMode === "now",
        attachments: files.filter((f) => f.path).map((f) => ({
          file_name: f.file.name, file_path: f.path!, mime_type: f.file.type || null, size_bytes: f.file.size,
        })),
      },
    }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(getUserErrorMessage(res.error)); return; }
      toast.success(res.status === "published" ? "Announcement published" : res.status === "scheduled" ? "Announcement scheduled" : "Announcement saved");
      navigate({ to: "/announcements/history" });
    },
    onError: (e: unknown) => toast.error(getUserErrorMessage(e)),
  });

  const sectionRequired = type === "class_specific" && !isAdmin;
  const valid = title.trim() && description.trim()
    && (type === "school_wide" || classId)
    && (!sectionRequired || sectionId)
    && (scheduleMode !== "later" || publishAt);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">New Announcement</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>Announcement Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as never)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="school_wide">School-Wide</SelectItem>
                <SelectItem value="class_specific">Class-Specific</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
        </div>

        <div>
          <Label>Title *</Label>
          <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. School Closure Notice" maxLength={200} />
        </div>

        <div>
          <Label>Description *</Label>
          <Textarea className="mt-1" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detailed announcement message…" maxLength={5000} />
        </div>

        <div>
          <Label>Category *</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {type === "class_specific" && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Class *</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {(scope?.classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Section {isAdmin ? "(optional — all sections if blank)" : "*"}</Label>
              <Select value={sectionId} onValueChange={setSectionId} disabled={!availableSections.length}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={availableSections.length ? "Select section" : "—"} /></SelectTrigger>
                <SelectContent>
                  {availableSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label>Scheduling *</Label>
            <Select value={scheduleMode} onValueChange={(v) => setScheduleMode(v as never)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="now">Publish Immediately</SelectItem>
                <SelectItem value="later">Schedule for Later</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scheduleMode === "later" && (
            <div>
              <Label>Publish Date *</Label>
              <Input type="datetime-local" className="mt-1" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Expiry Date</Label>
            <Input type="datetime-local" className="mt-1" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Attachments (PDF / DOCX / XLSX / Images, ≤10MB each)</Label>
          <div className="mt-1 flex items-center gap-2">
            <input id="ann-file" type="file" multiple className="hidden" onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }} />
            <Button type="button" variant="outline" onClick={() => document.getElementById("ann-file")?.click()}>
              <Upload className="h-4 w-4" /><span className="ml-1.5">Add files</span>
            </Button>
          </div>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-xs">
                  <span className="truncate">
                    {f.file.name} <span className="text-muted-foreground">({Math.round(f.file.size / 1024)}KB)</span>
                    {f.uploading && <span className="ml-2 text-muted-foreground">uploading…</span>}
                    {f.error && <span className="ml-2 text-destructive">{f.error}</span>}
                  </span>
                  <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <Button disabled={!valid || mutation.isPending || files.some((f) => f.uploading)} onClick={() => mutation.mutate()}>
            <Send className="h-4 w-4" /><span className="ml-1.5">{scheduleMode === "now" ? "Publish Announcement" : "Schedule Announcement"}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
