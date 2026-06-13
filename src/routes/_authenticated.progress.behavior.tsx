import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProgress } from "@/lib/progress.functions";
import { useProgressEntry } from "@/lib/progress-entry-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const { studentId, entry, setSection } = useProgressEntry();
  const { data } = useQuery({ queryKey: ["progress-behavior"], queryFn: () => list({ data: { type: "behavior" } }) });
  const disabled = !studentId;
  const v = entry.behavior;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Behavior Tracking</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {disabled && <p className="text-xs text-muted-foreground">Select a student above to enable this section.</p>}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Behavior Rating *</label>
            <Select disabled={disabled} value={v.behavior} onValueChange={(val) => setSection("behavior", { ...v, behavior: val as typeof v.behavior })}>
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
            <Textarea disabled={disabled} rows={3} value={v.notes} onChange={(e) => setSection("behavior", { ...v, notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

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
