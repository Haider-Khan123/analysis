import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProgress } from "@/lib/progress.functions";
import { useProgressEntry } from "@/lib/progress-entry-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/progress/academic")({
  component: AcademicPage,
});

function AcademicPage() {
  const list = useServerFn(listProgress);
  const { studentId, entry, setSection } = useProgressEntry();
  const { data } = useQuery({ queryKey: ["progress-academic"], queryFn: () => list({ data: { type: "academic" } }) });
  const disabled = !studentId;
  const v = entry.academic;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Academic Remark</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {disabled && <p className="text-xs text-muted-foreground">Select a student above to enable this section.</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Subject *</label>
              <Input disabled={disabled} value={v.subject} onChange={(e) => setSection("academic", { ...v, subject: e.target.value })} placeholder="e.g. Mathematics" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Remark Title</label>
              <Input disabled={disabled} value={v.title} onChange={(e) => setSection("academic", { ...v, title: e.target.value })} placeholder="Short headline" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Academic Remark</label>
            <Textarea disabled={disabled} rows={3} value={v.notes} onChange={(e) => setSection("academic", { ...v, notes: e.target.value })} placeholder="Overall academic feedback" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Strengths</label>
              <Textarea disabled={disabled} rows={2} value={v.strengths} onChange={(e) => setSection("academic", { ...v, strengths: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Areas for Improvement</label>
              <Textarea disabled={disabled} rows={2} value={v.improvements} onChange={(e) => setSection("academic", { ...v, improvements: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Academic Remarks</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.rows ?? []).length === 0 ? <p className="text-muted-foreground">No records yet.</p> :
            (data?.rows ?? []).slice(0, 25).map((r) => (
              <div key={r.id} className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">{r.record_date} · {r.student_name} · {r.subject ?? "—"}</p>
                {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                {r.notes && <p className="text-muted-foreground">{r.notes}</p>}
                {(r.strengths || r.improvements) && (
                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                    {r.strengths && <div><span className="font-medium text-emerald-700">Strengths:</span> {r.strengths}</div>}
                    {r.improvements && <div><span className="font-medium text-amber-700">Improve:</span> {r.improvements}</div>}
                  </div>
                )}
              </div>
            ))
          }
        </CardContent>
      </Card>
    </div>
  );
}
