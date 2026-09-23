import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getAttendanceSettings, updateAttendanceSettings } from "@/lib/attendance.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getUserErrorMessage } from "@/lib/user-error";

export const Route = createFileRoute("/_authenticated/attendance/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const fetchSettings = useServerFn(getAttendanceSettings);
  const update = useServerFn(updateAttendanceSettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["att-settings"], queryFn: () => fetchSettings() });
  const [threshold, setThreshold] = useState<number>(75);
  useEffect(() => { if (data?.threshold != null) setThreshold(data.threshold); }, [data?.threshold]);

  const mutation = useMutation({
    mutationFn: () => update({ data: { threshold } }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(getUserErrorMessage(res.error)); return; }
      toast.success("Settings updated");
      qc.invalidateQueries({ queryKey: ["att-settings"] });
    },
  });

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Attendance Settings</CardTitle>
        <CardDescription>Configure attendance behavior for your institute.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Low attendance threshold (%)</label>
          <Input type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          <p className="mt-1 text-xs text-muted-foreground">Students below this percentage will appear in the Low Attendance Report.</p>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Edit cutoff:</strong> Teachers can mark and edit attendance only for today.
          After today, only an administrator can edit a record.
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save Settings</Button>
      </CardContent>
    </Card>
  );
}
