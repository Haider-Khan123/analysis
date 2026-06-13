import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProgress } from "@/lib/progress.functions";
import { useProgressEntry } from "@/lib/progress-entry-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/progress/participation")({
  component: ParticipationPage,
});

const tone: Record<string, string> = {
  highly_active: "bg-emerald-500/15 text-emerald-700",
  active: "bg-sky-500/15 text-sky-700",
  moderate: "bg-amber-500/15 text-amber-700",
  passive: "bg-rose-500/15 text-rose-700",
};

function ParticipationPage() {
  const list = useServerFn(listProgress);
  const { studentId, entry, setSection } = useProgressEntry();
  const { data } = useQuery({ queryKey: ["progress-participation"], queryFn: () => list({ data: { type: "participation" } }) });
  const disabled = !studentId;
  const v = entry.participation;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Participation Tracking</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {disabled && <p className="text-xs text-muted-foreground">Select a student above to enable this section.</p>}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Participation Level *</label>
            <Select disabled={disabled} value={v.participation} onValueChange={(val) => setSection("participation", { ...v, participation: val as typeof v.participation })}>
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
            <Textarea disabled={disabled} rows={3} value={v.notes} onChange={(e) => setSection("participation", { ...v, notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Participation Records</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.rows ?? []).length === 0 ? <p className="text-muted-foreground">No records yet.</p> :
            (data?.rows ?? []).slice(0, 25).map((r) => (
              <div key={r.id} className="flex items-start justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-xs text-muted-foreground">{r.record_date} · {r.student_name}</p>
                  {r.notes && <p>{r.notes}</p>}
                </div>
                {r.participation && <Badge variant="outline" className={`${tone[r.participation]} capitalize`}>{r.participation.replace("_", " ")}</Badge>}
              </div>
            ))
          }
        </CardContent>
      </Card>
    </div>
  );
}
