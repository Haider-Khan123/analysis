import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ProgressForm } from "@/components/progress-form";
import { listProgress } from "@/lib/progress.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/progress/behavior")({
  component: BehaviorPage,
});

const tone: Record<string, string> = {
  excellent: "bg-emerald-500/15 text-emerald-700",
  good: "bg-sky-500/15 text-sky-700",
  average: "bg-amber-500/15 text-amber-700",
  needs_improvement: "bg-rose-500/15 text-rose-700",
};

function BehaviorPage() {
  const list = useServerFn(listProgress);
  const { data } = useQuery({ queryKey: ["progress-behavior"], queryFn: () => list({ data: { type: "behavior" } }) });
  return (
    <div className="space-y-4">
      <ProgressForm type="behavior" title="Behavior Tracking" invalidateKey="progress-behavior" />
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Behavior Records</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.rows ?? []).length === 0 ? <p className="text-muted-foreground">No records yet.</p> :
            (data?.rows ?? []).slice(0, 25).map((r) => (
              <div key={r.id} className="flex items-start justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-xs text-muted-foreground">{r.record_date} · {r.student_name}</p>
                  {r.notes && <p>{r.notes}</p>}
                </div>
                {r.behavior && <Badge variant="outline" className={`${tone[r.behavior]} capitalize`}>{r.behavior.replace("_", " ")}</Badge>}
              </div>
            ))
          }
        </CardContent>
      </Card>
    </div>
  );
}
