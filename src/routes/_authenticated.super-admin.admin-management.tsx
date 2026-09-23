import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, ShieldCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { listSchoolAdmins, setSchoolSuspension } from "@/lib/super-admin.functions";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

import { getUserErrorMessage } from "@/lib/user-error";
export const Route = createFileRoute("/_authenticated/super-admin/admin-management")({
  component: AdminManagementPage,
});

const PAGE_SIZE = 10;

function AdminManagementPage() {
  const navigate = useNavigate();
  const { roles, loading } = useAuth();
  const qc = useQueryClient();
  const fetchAdmins = useServerFn(listSchoolAdmins);
  const toggleFn = useServerFn(setSchoolSuspension);

  const isSuperAdmin = roles.includes("super_admin" as never);

  useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/dashboard", replace: true });
  }, [loading, isSuperAdmin, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["super-admin", "admins"],
    queryFn: () => fetchAdmins(),
    enabled: isSuperAdmin,
  });

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"name" | "school" | "email">("name");

  const filtered = useMemo(() => {
    const items = data?.admins ?? [];
    const needle = q.trim().toLowerCase();
    const out = needle
      ? items.filter(
          (a) =>
            a.full_name.toLowerCase().includes(needle) ||
            a.email.toLowerCase().includes(needle) ||
            (a.school_name ?? "").toLowerCase().includes(needle),
        )
      : items;
    return [...out].sort((a, b) => {
      const av =
        sortBy === "name" ? a.full_name : sortBy === "school" ? a.school_name ?? "" : a.email;
      const bv =
        sortBy === "name" ? b.full_name : sortBy === "school" ? b.school_name ?? "" : b.email;
      return av.localeCompare(bv);
    });
  }, [data, q, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [q, sortBy]);

  const toggle = useMutation({
    mutationFn: (vars: { schoolId: string; suspended: boolean }) =>
      toggleFn({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.suspended ? "Admin blocked" : "Admin re-activated");
      qc.invalidateQueries({ queryKey: ["super-admin", "admins"] });
    },
    onError: (e: Error) => toast.error(getUserErrorMessage(e)),
  });

  if (loading || !isSuperAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Super Admin</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin Management</h1>
        <p className="text-sm text-muted-foreground">
          Suspend or re-activate any school administrator. Suspending blocks the admin and pauses
          access to every record in that school — nothing is deleted.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, or school…"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name" | "school" | "email")}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="name">Full name</option>
              <option value="school">School</option>
              <option value="email">Email</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>School Profile</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-destructive">
                    Failed to load admins.
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                    No school admins found.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((a) => {
                  const active = !a.is_suspended;
                  const pending =
                    toggle.isPending && toggle.variables?.schoolId === a.school_id;
                  return (
                    <TableRow key={a.user_id}>
                      <TableCell className="font-medium text-foreground">{a.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.school_name ?? <span className="italic">No school</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-3">
                          <Badge
                            variant="outline"
                            className={
                              active
                                ? "border-secondary/40 bg-secondary/10 text-secondary"
                                : "border-destructive/40 bg-destructive/10 text-destructive"
                            }
                          >
                            {active ? "Active" : "Blocked"}
                          </Badge>
                          <Switch
                            checked={active}
                            disabled={!a.school_id || pending}
                            onCheckedChange={(v) =>
                              a.school_id &&
                              toggle.mutate({ schoolId: a.school_id, suspended: !v })
                            }
                            aria-label="Toggle admin status"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 border-t border-border p-4 text-sm text-muted-foreground">
            <div>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >Prev</Button>
              <span>Page {page} / {totalPages}</span>
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
