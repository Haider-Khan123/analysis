import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCheck, Save, Send } from "lucide-react";
import { getMarkableScope, getSectionRoster, saveAttendance, type AttendanceStatus } from "@/lib/attendance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/attendance/mark")({
  component: MarkAttendancePage,
});

const STATUSES: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: "present", label: "Present", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { value: "absent", label: "Absent", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  { value: "late", label: "Late", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { value: "leave", label: "Leave", color: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

function MarkAttendancePage() {
  const fetchScope = useServerFn(getMarkableScope);
  const fetchRoster = useServerFn(getSectionRoster);
  const save = useServerFn(saveAttendance);
  const qc = useQueryClient();

  const { data: scope } = useQuery({
    queryKey: ["att-scope"],
    queryFn: () => fetchScope(),
  });

  const [classId, setClassId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [date, setDate] = useState(todayStr());

  const availableSections = useMemo(
    () => (scope?.sections ?? []).filter((s) => !classId || s.class_id === classId),
    [scope, classId],
  );

  const { data: roster, isLoading } = useQuery({
    queryKey: ["att-roster", sectionId, date],
    queryFn: () => fetchRoster({ data: { sectionId, date } }),
    enabled: !!sectionId && !!date,
  });

  const [rows, setRows] = useState<Record<string, { status: AttendanceStatus; remarks: string }>>({});

  // Sync state when roster changes
  useMemo(() => {
    if (!roster?.ok) return;
    const next: typeof rows = {};
    roster.students.forEach((s) => {
      next[s.id] = {
        status: (s.record?.status as AttendanceStatus) ?? "present",
        remarks: s.record?.remarks ?? "",
      };
    });
    setRows(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster?.section?.id, roster?.students?.length, date]);

  const bulkPresent = () => {
    setRows((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { next[k] = { ...next[k], status: "present" }; });
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: (isDraft: boolean) => save({
      data: {
        sectionId,
        date,
        isDraft,
        records: Object.entries(rows).map(([student_id, r]) => ({
          student_id, status: r.status, remarks: r.remarks || null,
        })),
      },
    }),
    onSuccess: (res, isDraft) => {
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(isDraft ? "Draft saved" : `Attendance saved (${res.count})`);
      qc.invalidateQueries({ queryKey: ["att-roster"] });
      qc.invalidateQueries({ queryKey: ["att-history"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select class, section, and date</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Class</label>
            <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(""); }}>
              <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                {(scope?.classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Section</label>
            <Select value={sectionId} onValueChange={setSectionId} disabled={!availableSections.length}>
              <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
              <SelectContent>
                {availableSections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Date</label>
            <Input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" disabled={!sectionId || !roster?.editable} onClick={bulkPresent}>
              <CheckCheck className="h-4 w-4" /> <span className="ml-1.5">Mark All Present</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {sectionId ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Students {roster?.ok && roster.students.length ? `(${roster.students.length})` : ""}
            </CardTitle>
            {roster && !roster.editable && (
              <Badge variant="outline">Locked — past date (admin can edit)</Badge>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : !roster?.ok ? (
              <p className="py-8 text-center text-sm text-destructive">{roster && "error" in roster ? roster.error : "Failed to load"}</p>
            ) : roster.students.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No enrolled students in this section.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Attendance ID</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster.students.map((s) => {
                      const row = rows[s.id] ?? { status: "present" as AttendanceStatus, remarks: "" };
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.attendance_id ?? "—"}</TableCell>
                          <TableCell className="font-medium">{s.full_name}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {STATUSES.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  disabled={!roster.editable}
                                  onClick={() => setRows((p) => ({ ...p, [s.id]: { ...row, status: opt.value } }))}
                                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                    row.status === opt.value
                                      ? opt.color + " ring-1 ring-current"
                                      : "bg-muted text-muted-foreground hover:bg-accent"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={row.remarks}
                              disabled={!roster.editable}
                              onChange={(e) => setRows((p) => ({ ...p, [s.id]: { ...row, remarks: e.target.value } }))}
                              placeholder="—"
                              className="h-8"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {roster.editable && (
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>
                      <Save className="h-4 w-4" /> <span className="ml-1.5">Save Draft</span>
                    </Button>
                    <Button disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>
                      <Send className="h-4 w-4" /> <span className="ml-1.5">Submit Attendance</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Select a section to begin.</CardContent></Card>
      )}
    </div>
  );
}
