import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Users as UsersIcon, RefreshCw } from "lucide-react";
import { listAllUsers, type AppUserRow } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/users")({
  component: UserManagement,
});

const SOURCES = ["all", "admin", "teacher", "parent", "student", "other"] as const;
type SourceFilter = typeof SOURCES[number];

function UserManagement() {
  const fetchUsers = useServerFn(listAllUsers);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => fetchUsers(),
  });

  const [q, setQ] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");

  // Realtime: refetch on changes to any user-bearing table
  useEffect(() => {
    const channel = supabase
      .channel("user-management")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "teachers" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "parents" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const users: AppUserRow[] = data?.users ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (source !== "all" && u.source !== source) return false;
      if (!needle) return true;
      return [u.full_name, u.email, u.phone, u.source_label, ...u.roles]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [users, q, source]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: users.length, admin: 0, teacher: 0, parent: 0, student: 0, other: 0 };
    users.forEach((u) => { c[u.source] = (c[u.source] ?? 0) + 1; });
    return c;
  }, [users]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <UsersIcon className="h-6 w-6" /> User Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Centralized directory of every user across the platform — synced in real time.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {SOURCES.map((s) => (
          <Card key={s} className={source === s ? "border-primary" : ""}>
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-xs font-medium capitalize text-muted-foreground">{s}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <button onClick={() => setSource(s)} className="text-2xl font-semibold tabular-nums">
                {counts[s] ?? 0}
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">All users ({filtered.length})</CardTitle>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, email, phone, role…"
                className="pl-8 md:w-80"
              />
            </div>
            <Select value={source} onValueChange={(v) => setSource(v as SourceFilter)}>
              <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading users…</p>
          ) : data?.error ? (
            <p className="py-8 text-center text-sm text-destructive">{data.error}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        No users match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.phone ?? "—"}</TableCell>
                      <TableCell className="text-sm">{u.source_label}</TableCell>
                      <TableCell className="space-x-1">
                        {u.roles.length === 0
                          ? <span className="text-xs text-muted-foreground">—</span>
                          : u.roles.map((r) => <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>)}
                      </TableCell>
                      <TableCell>
                        {u.status ? (
                          <Badge variant={u.status === "active" ? "default" : "outline"} className="capitalize">
                            {u.status}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
