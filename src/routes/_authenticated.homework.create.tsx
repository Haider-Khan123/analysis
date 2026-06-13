import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, X, Send } from "lucide-react";
import { getHomeworkScope, createHomework } from "@/lib/homework.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/homework/create")({
  component: CreateHomeworkPage,
});

const todayStr = () => new Date().toISOString().slice(0, 10);
const ALLOWED = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

type PendingAttachment = { file: File; path?: string; uploading?: boolean; error?: string };

function CreateHomeworkPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fetchScope = useServerFn(getHomeworkScope);
  const create = useServerFn(createHomework);

  const { data: scope } = useQuery({ queryKey: ["hw-scope"], queryFn: () => fetchScope() });

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [scopeChoice, setScopeChoice] = useState<"class" | "section">("section");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedDate, setAssignedDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState(todayStr());
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
      if (!ALLOWED.includes(f.type) && !/\.(pdf|docx?|png|jpe?g|gif|webp)$/i.test(f.name)) {
        toast.error(`${f.name} not supported`); continue;
      }
      valid.push({ file: f, uploading: true });
    }
    setFiles((p) => [...p, ...valid]);
    for (const pending of valid) {
      const path = `${user.id}/${Date.now()}-${pending.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("homework-attachments").upload(path, pending.file, { contentType: pending.file.type || undefined });
      setFiles((p) => p.map((x) => x.file === pending.file ? { ...x, uploading: false, path: error ? undefined : path, error: error?.message } : x));
    }
  };

  const removeFile = async (idx: number) => {
    const f = files[idx];
    if (f.path) await supabase.storage.from("homework-attachments").remove([f.path]);
    setFiles((p) => p.filter((_, i) => i !== idx));
  };

  const mutation = useMutation({
    mutationFn: () => create({
      data: {
        classId, sectionId: scopeChoice === "section" ? sectionId : null, scope: scopeChoice,
        subject, title, description: description || null,
        assignedDate, dueDate,
        attachments: files.filter((f) => f.path).map((f) => ({
          file_name: f.file.name, file_path: f.path!, mime_type: f.file.type || null, size_bytes: f.file.size,
        })),
      },
    }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Homework created");
      navigate({ to: "/homework/list" });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const valid = classId && subject.trim() && title.trim() && dueDate >= assignedDate && (scopeChoice === "class" || sectionId);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">New Homework</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Class *</label>
            <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {(scope?.classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Scope *</label>
            <Select value={scopeChoice} onValueChange={(v) => setScopeChoice(v as "class" | "section")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="section">Single section</SelectItem>
                <SelectItem value="class">Entire class</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scopeChoice === "section" && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Section *</label>
              <Select value={sectionId} onValueChange={setSectionId} disabled={!availableSections.length}>
                <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  {availableSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Subject *</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mathematics" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 3 Exercises" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Description</label>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details, instructions, references…" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Assigned Date *</label>
            <Input type="date" value={assignedDate} onChange={(e) => setAssignedDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Due Date *</label>
            <Input type="date" value={dueDate} min={assignedDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Attachments (PDF / DOCX / Images, ≤10MB each)</label>
          <div className="flex items-center gap-2">
            <input id="hw-file" type="file" multiple className="hidden" onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }} />
            <Button type="button" variant="outline" onClick={() => document.getElementById("hw-file")?.click()}>
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
            <Send className="h-4 w-4" /><span className="ml-1.5">Assign Homework</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
