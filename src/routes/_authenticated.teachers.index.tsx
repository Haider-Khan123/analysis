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
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { inviteUserForRow } from "@/lib/school.functions";
import { createTeacher } from "@/lib/teachers.functions";
import {
  TeacherForm, emptyTeacher, validateTeacher, type TeacherFormValues,
} from "@/components/teacher-form";
import { PageHeader } from "./_authenticated.classes";

export const Route = createFileRoute("/_authenticated/teachers/")({
  head: () => ({ meta: [{ title: "Teachers — Analysis" }] }),
  component: TeachersPage,
});

function TeachersPage() {
  const { roles } = useAuth();
  const { schoolId, schoolName } = useCurrentSchool();
  const isAdmin = roles.includes("admin") || roles.length === 0;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TeacherFormValues>(emptyTeacher);
  const [search, setSearch] = useState("");
  const create = useServerFn(createTeacher);
  const invite = useServerFn(inviteUserForRow);

  const q = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers")
        .select("id, full_name, first_name, last_name, email, phone, subject, designation, department, status, employee_id, photo_url, user_id")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No institute. Create it in School Profile first.");
      const err = validateTeacher(form, { requireLogin: true });
      if (err) throw new Error(err);
      const res = await create({
        data: {
          employee_id: form.employee_id || null,
          first_name: form.first_name, last_name: form.last_name,
          gender: form.gender || null,
          date_of_birth: form.date_of_birth || null,
          cnic: form.cnic, photo_data_url: form.photo_data_url,
          phone: form.phone, email: form.email,
          address: form.address || null,
          joining_date: form.joining_date,
          designation: form.designation, department: form.department,
          status: form.status, subject: form.subject || null,
          loginMode: form.loginMode,
          password: form.loginMode === "password" ? form.password : null,
        },
      });
      if (!res.ok) throw new Error(res.error);
      if (res.loginError) toast.warning(`Saved, but login failed: ${res.loginError}`);
    },
    onSuccess: () => {
      toast.success("Teacher added");
      setOpen(false); setForm(emptyTeacher);
      qc.invalidateQueries({ queryKey: ["teachers"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teachers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Teacher removed");
      qc.invalidateQueries({ queryKey: ["teachers"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendInvite = useMutation({
    mutationFn: async (rowId: string) => {
      const res = await invite({ data: { kind: "teacher", rowId } });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Invite sent");
      qc.invalidateQueries({ queryKey: ["teachers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = q.data ?? [];
    if (!term) return list;
    return list.filter((t) =>
      [t.full_name, t.email, t.phone, t.subject, t.designation, t.department, t.employee_id]
        .some((v) => (v ?? "").toString().toLowerCase().includes(term))
    );
  }, [q.data, term]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Teachers" subtitle="Manage teaching staff and their logins." />
        {isAdmin && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyTeacher); }}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Add teacher</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New teacher</DialogTitle>
                {schoolName && <p className="text-xs text-muted-foreground">Institute: {schoolName}</p>}
              </DialogHeader>
              <TeacherForm value={form} onChange={setForm} mode="create" />
              <DialogFooter>
                <Button onClick={() => add.mutate()} disabled={add.isPending || !schoolId}>
                  {add.isPending ? "Saving…" : "Save teacher"}
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
          placeholder="Search by name, email, employee ID, department…"
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <ScrollArea className="max-h-[60vh] pr-2">
          {q.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !rows.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {term ? "No matching teachers." : "No teachers yet."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Teacher</th>
                  <th className="py-2 pr-3 font-medium">Employee ID</th>
                  <th className="py-2 pr-3 font-medium">Designation</th>
                  <th className="py-2 pr-3 font-medium">Department</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Login</th>
                  {isAdmin && <th className="py-2 text-right" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="py-3 pr-3">
                      <Link to="/teachers/$teacherId" params={{ teacherId: t.id }} className="flex items-center gap-3">
                        <div className="h-9 w-9 overflow-hidden rounded-full bg-muted">
                          {t.photo_url ? <img src={t.photo_url} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div>
                          <div className="font-medium text-foreground hover:underline">{t.full_name}</div>
                          <div className="text-xs text-muted-foreground">{t.email}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{t.employee_id ?? "—"}</td>
                    <td className="py-3 pr-3">{t.designation ?? "—"}</td>
                    <td className="py-3 pr-3">{t.department ?? "—"}</td>
                    <td className="py-3 pr-3">
                      <span className={
                        "rounded-full px-2 py-0.5 text-xs " +
                        (t.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")
                      }>
                        {t.status ?? "active"}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      {t.user_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <Check className="h-3 w-3" /> Active
                        </span>
                      ) : isAdmin ? (
                        <Button
                          size="sm" variant="outline"
                          disabled={!t.email || sendInvite.isPending}
                          onClick={() => sendInvite.mutate(t.id)}
                        >
                          <Mail className="mr-1 h-3 w-3" /> Invite
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">No login</span>}
                    </td>
                    {isAdmin && (
                      <td className="py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => del.mutate(t.id)}>
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

// Re-export for routes that depended on the old Field helper
export function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
