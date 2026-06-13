import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { getProgressScope } from "@/lib/progress.functions";
import { createProgress, type ProgressType } from "@/lib/progress.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const todayStr = () => new Date().toISOString().slice(0, 10);

export function ProgressForm({ type, title, invalidateKey }: { type: ProgressType; title: string; invalidateKey: string }) {
  const fetchScope = useServerFn(getProgressScope);
  const create = useServerFn(createProgress);
  const qc = useQueryClient();

  const { data: scope } = useQuery({ queryKey: ["progress-scope"], queryFn: () => fetchScope() });

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [recordDate, setRecordDate] = useState(todayStr());
  const [obsTitle, setObsTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [subject, setSubject] = useState("");
  const [behavior, setBehavior] = useState<string>("");
  const [participation, setParticipation] = useState<string>("");
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");

  const sections = useMemo(
    () => (scope?.sections ?? []).filter((s) => !classId || s.class_id === classId),
    [scope, classId],
  );
  const students = useMemo(
    () => (scope?.students ?? []).filter((s) =>
      (!classId || s.class_id === classId) && (!sectionId || s.section_id === sectionId)),
    [scope, classId, sectionId],
  );

  const mutation = useMutation({
    mutationFn: () => create({
      data: {
        studentId, recordDate, type,
        title: obsTitle || null,
        notes: notes || null,
        subject: type === "academic" ? subject : null,
        behavior: type === "behavior" ? (behavior as "excellent" | "good" | "average" | "needs_improvement") : null,
        participation: type === "participation" ? (participation as "highly_active" | "active" | "moderate" | "passive") : null,
        strengths: type === "academic" ? strengths : null,
        improvements: type === "academic" ? improvements : null,
      },
    }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: [invalidateKey] });
      setObsTitle(""); setNotes(""); setSubject(""); setBehavior(""); setParticipation(""); setStrengths(""); setImprovements("");
    },
  });

  const canSave = studentId && recordDate
    && (type !== "behavior" || behavior)
    && (type !== "participation" || participation)
    && (type !== "academic" || subject.trim());

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Class</label>
            <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); setStudentId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(scope?.classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Section</label>
            <Select value={sectionId || "all"} onValueChange={(v) => { setSectionId(v === "all" ? "" : v); setStudentId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Student *</label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Date *</label>
            <Input type="date" value={recordDate} max={todayStr()} onChange={(e) => setRecordDate(e.target.value)} />
          </div>
        </div>

        {(type === "observation") && (
          <>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Title</label>
              <Input value={obsTitle} onChange={(e) => setObsTitle(e.target.value)} placeholder="e.g. Excellent classroom participation" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </>
        )}

        {type === "behavior" && (
          <>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Behavior Rating *</label>
              <Select value={behavior} onValueChange={setBehavior}>
                <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="average">Average</SelectItem>
                  <SelectItem value="needs_improvement">Needs Improvement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Comments</label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </>
        )}

        {type === "participation" && (
          <>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Participation Level *</label>
              <Select value={participation} onValueChange={setParticipation}>
                <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="highly_active">Highly Active</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="passive">Passive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </>
        )}

        {type === "academic" && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Subject *</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mathematics" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Remark Title</label>
                <Input value={obsTitle} onChange={(e) => setObsTitle(e.target.value)} placeholder="Short headline" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Academic Remark</label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Overall academic feedback" />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Strengths</label>
                <Textarea rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Areas for Improvement</label>
                <Textarea rows={2} value={improvements} onChange={(e) => setImprovements(e.target.value)} />
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
            <Save className="h-4 w-4" /><span className="ml-1.5">Save Record</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
