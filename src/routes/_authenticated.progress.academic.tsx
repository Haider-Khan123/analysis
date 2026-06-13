import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ProgressForm } from "@/components/progress-form";
import { listProgress } from "@/lib/progress.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/progress/academic")({
  component: AcademicPage,
});

function AcademicPage() {
  const list = useServerFn(listProgress);
  const { data } = useQuery({ queryKey: ["progress-academic"], queryFn: () => list({ data: { type: "academic" } }) });
  return (
    <div className="space-y-4">
      <ProgressForm type="academic" title="Academic Remark" invalidateKey="progress-academic" />
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
