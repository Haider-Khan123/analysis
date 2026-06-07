import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Search, Trash2, Mail, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCurrentSchool } from "@/lib/use-current-school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { titleCase } from "@/lib/utils";
import { PageHeader } from "./_authenticated.classes";
import {
  ParentForm, emptyParent, validateParent, type ParentFormValues,
} from "@/components/parent-form";
import { createParent, deleteParent } from "@/lib/parents.functions";
import { inviteUserForRow } from "@/lib/school.functions";
import { getTeacherScopedData } from "@/lib/teacher-scope.functions";

export const Route = createFileRoute("/_authenticated/parents/")({
  head: () => ({ meta: [{ title: "Parents — Analysis" }] }),
  component: ParentsListPage,
});

function ParentsListPage() {
  const { roles } = useAuth();
  const { schoolId, schoolName } = useCurrentSchool();
  const isAdmin = roles.includes("admin") || roles.length === 0;
  const isTeacher = roles.includes("teacher") && !roles.includes("admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ParentFormValues>(emptyParent);
  const [search, setSearch] = useState("");

  const create = useServerFn(createParent);
  const remove = useServerFn(deleteParent);
  const invite = useServerFn(inviteUserForRow);
  const fetchScope = useServerFn(getTeacherScopedData);

  const scopeQ = useQuery({
    queryKey: ["teacher-scope"],
    queryFn: () => fetchScope(),
    enabled: isTeacher,
  });

  const parentsQ = useQuery({
    queryKey: ["parents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parents")
        .select("id, parent_id, full_name, first_name, last_name, email, phone, cnic, photo_url, status, user_id")
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: !isTeacher,
  });

  const studentsQ = useQuery({
    queryKey: ["students-all"],
    queryFn: async () => (await supabase.from("students")
      .select("id, full_name, admission_number").order("full_name")).data ?? [],
    enabled: !isTeacher,
  });

  const parentsData = isTeacher ? (scopeQ.data?.parents ?? []) : (parentsQ.data ?? []);
  const studentsList = isTeacher
    ? (scopeQ.data?.students ?? []).map((s) => ({
        id: s.id, full_name: s.full_name, admission_number: s.admission_number,
      }))
    : (studentsQ.data ?? []);
  const parentsLoading = isTeacher ? scopeQ.isLoading : parentsQ.isLoading;

  const add = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No institute. Create it in School Profile first.");
      const err = validateParent(form);
      if (err) throw new Error(err);
      const res = await create({
        data: {
          parent_id: form.parent_id,
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          alternate_phone: form.alternate_phone || null,
          email: form.email,
          cnic: form.cnic || null,
          occupation: form.occupation || null,
          address: form.address || null,
          city: form.city || null,
          photo_data_url: form.photo_data_url,
          status: form.status,
          loginMode: form.loginMode,
          password: form.password || "",
          students: form.students.filter((s) => s.student_id),
        },
      });
      if (!res.ok) throw new Error(res.error);
      if (res.loginError) toast.warning(`Parent saved, but login not created: ${res.loginError}`);
      if (res.linkError) toast.warning(`Some student links failed: ${res.linkError}`);
    },

    onSuccess: () => {
      toast.success("Parent added");
      setOpen(false); setForm(emptyParent);
      qc.invalidateQueries({ queryKey: ["parents"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await remove({ data: { id } });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Parent removed");
      qc.invalidateQueries({ queryKey: ["parents"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendInvite = useMutation({
    mutationFn: async (rowId: string) => {
      const res = await invite({ data: { kind: "parent", rowId } });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Invite sent");
      qc.invalidateQueries({ queryKey: ["parents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = parentsData;
    if (!term) return list;
    return list.filter((p) =>
      [p.full_name, p.parent_id, p.phone, p.cnic]
        .some((v) => (v ?? "").toString().toLowerCase().includes(term))
    );
  }, [parentsData, term]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Parents" subtitle="Manage parent/guardian contacts and their child links." />
        {isAdmin && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyParent); }}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Add Parent</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Parent</DialogTitle>
                {schoolName && <p className="text-xs text-muted-foreground">Institute: {schoolName}</p>}
              </DialogHeader>
              <ParentForm value={form} onChange={setForm} students={studentsList} />
              <DialogFooter>
                <Button onClick={() => add.mutate()} disabled={add.isPending || !schoolId}>
                  {add.isPending ? "Saving…" : "Save Parent"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by parent ID, name, mobile number, or CNIC…"
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <ScrollArea className="max-h-[60vh] pr-2">
          {parentsQ.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !rows.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {term ? "No matching parents." : "No parents added yet."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Parent</th>
                  <th className="py-2 pr-3 font-medium">Parent ID</th>
                  <th className="py-2 pr-3 font-medium">Mobile</th>
                  <th className="py-2 pr-3 font-medium">CNIC</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Login</th>
                  {isAdmin && <th className="py-2 text-right" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="py-3 pr-3">
                      <Link to="/parents/$parentId" params={{ parentId: p.id }} className="flex items-center gap-3">
                        <div className="h-9 w-9 overflow-hidden rounded-full bg-muted">
                          {p.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div>
                          <div className="font-medium text-foreground hover:underline">{titleCase(p.full_name)}</div>
                          <div className="text-xs text-muted-foreground">{p.email ?? "—"}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{p.parent_id ?? "—"}</td>
                    <td className="py-3 pr-3">{p.phone ?? "—"}</td>
                    <td className="py-3 pr-3">{p.cnic ?? "—"}</td>
                    <td className="py-3 pr-3">
                      <span className={
                        "rounded-full px-2 py-0.5 text-xs " +
                        (p.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")
                      }>
                        {titleCase(p.status ?? "active")}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      {p.user_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <Check className="h-3 w-3" /> Active
                        </span>
                      ) : isAdmin ? (
                        <Button
                          size="sm" variant="outline"
                          disabled={!p.email || sendInvite.isPending}
                          onClick={() => sendInvite.mutate(p.id)}
                        >
                          <Mail className="mr-1 h-3 w-3" /> Invite
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">No login</span>}
                    </td>
                    {isAdmin && (
                      <td className="py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => del.mutate(p.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
