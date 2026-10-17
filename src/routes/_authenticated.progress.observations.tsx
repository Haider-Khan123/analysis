import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProgress } from "@/lib/progress.functions";
import { useProgressEntry } from "@/lib/progress-entry-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/progress/observations")({
  component: ObservationsPage,
});

function ObservationsPage() {
  const list = useServerFn(listProgress);
  const { studentId, entry, setSection } = useProgressEntry();
  const { data } = useQuery({ queryKey: ["progress-observation"], queryFn: () => list({ data: { type: "observation" } }) });

  const disabled = !studentId;
  const v = entry.observation;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Daily Observation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {disabled && <p className="text-xs text-muted-foreground">Select a student above to enable this section.</p>}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Title</label>
            <Input disabled={disabled} value={v.title} onChange={(e) => setSection("observation", { ...v, title: e.target.value })} placeholder="e.g. Excellent classroom participation" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Notes *</label>
            <Textarea disabled={disabled} rows={3} value={v.notes} onChange={(e) => setSection("observation", { ...v, notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Observations</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.rows ?? []).length === 0 ? <p className="text-muted-foreground">No observations recorded yet.</p> :
            (data?.rows ?? []).slice(0, 25).map((r) => (
              <div key={r.id} className="rounded-md border border-border p-3">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{r.record_date} · {r.student_name}</span>
                  <span>{r.teacher_name}</span>
                </div>
                {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                {r.notes && <p className="text-muted-foreground">{r.notes}</p>}
              </div>
            ))
          }
        </CardContent>
      </Card>
    </div>
  );
}
