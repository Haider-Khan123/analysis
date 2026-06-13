import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ProgressForm } from "@/components/progress-form";
import { listProgress } from "@/lib/progress.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/progress/observations")({
  component: ObservationsPage,
});

function ObservationsPage() {
  const list = useServerFn(listProgress);
  const { data } = useQuery({ queryKey: ["progress-observation"], queryFn: () => list({ data: { type: "observation" } }) });
  return (
    <div className="space-y-4">
      <ProgressForm type="observation" title="Daily Observation" invalidateKey="progress-observation" />
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
