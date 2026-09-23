import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import {
  getMarkableScope,
  getAttendanceHistory,
  updateAttendanceRecord,
  type AttendanceStatus,
} from "@/lib/attendance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

import { getUserErrorMessage } from "@/lib/user-error";
export const Route = createFileRoute("/_authenticated/attendance/history")({
  component: HistoryPage,
});

const STATUS_BADGE: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  absent: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  late: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  leave: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "leave"];

type EditRow = {
  id: string;
  student_name: string;
  attendance_date: string;
  status: AttendanceStatus;
  remarks: string;
};

function formatRemaining(createdAt: string): string {
  const remainingMs = 24 * 60 * 60 * 1000 - (Date.now() - new Date(createdAt).getTime());
  if (remainingMs <= 0) return "expired";
  const h = Math.floor(remainingMs / 3_600_000);
  const m = Math.floor((remainingMs % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function HistoryPage() {
  const fetchScope = useServerFn(getMarkableScope);
  const fetchHistory = useServerFn(getAttendanceHistory);
  const updateRecord = useServerFn(updateAttendanceRecord);
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isParent = roles.includes("parent") && !roles.includes("admin") && !roles.includes("teacher");

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400_000);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [classId, setClassId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [editing, setEditing] = useState<EditRow | null>(null);

  const { data: scope } = useQuery({ queryKey: ["att-scope"], queryFn: () => fetchScope() });
  const sections = useMemo(
    () => (scope?.sections ?? []).filter((s) => !classId || s.class_id === classId),
    [scope, classId],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["att-history", from, to, classId, sectionId],
    queryFn: () => fetchHistory({ data: { from, to, classId: classId || null, sectionId: sectionId || null } }),
  });

  const editMutation = useMutation({
    mutationFn: () => updateRecord({
      data: {
        recordId: editing!.id,
        status: editing!.status,
        remarks: editing!.remarks || null,
      },
    }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(getUserErrorMessage(res.error)); return; }
      toast.success("Attendance updated");
      qc.invalidateQueries({ queryKey: ["att-history"] });
      setEditing(null);
    },
    onError: (e: unknown) => toast.error(getUserErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className={cn("grid gap-3", isParent ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {!isParent && (
            <>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Class</label>
                <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {(scope?.classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Section</label>
                <Select value={sectionId || "all"} onValueChange={(v) => setSectionId(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sections</SelectItem>
                    {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Records ({data?.rows.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Marked By</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No records.</TableCell></TableRow>
                  ) : (data?.rows ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.attendance_date}</TableCell>
                      <TableCell className="font-medium">{r.student_name}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE[r.status] + " capitalize"} variant="outline">{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.remarks || "—"}</TableCell>
                      <TableCell className="text-sm">{r.marked_by_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {r.can_edit ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] text-muted-foreground">{formatRemaining(r.created_at)}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing({
                                id: r.id,
                                student_name: r.student_name,
                                attendance_date: r.attendance_date,
                                status: r.status as AttendanceStatus,
                                remarks: r.remarks ?? "",
                              })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="ml-1">Edit</span>
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Locked</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Attendance</DialogTitle>
            <DialogDescription>
              {editing ? `${editing.student_name} — ${editing.attendance_date}` : ""}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Status</label>
                <Select
                  value={editing.status}
                  onValueChange={(v) => setEditing({ ...editing, status: v as AttendanceStatus })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Remarks</label>
                <Input
                  value={editing.remarks}
                  onChange={(e) => setEditing({ ...editing, remarks: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={editMutation.isPending}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending}>
              {editMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
