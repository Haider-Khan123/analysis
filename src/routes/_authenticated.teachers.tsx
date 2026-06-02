import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Mail, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { inviteUserForRow } from "@/lib/school.functions";
import { PageHeader, EntityTable } from "./_authenticated.classes";

export const Route = createFileRoute("/_authenticated/teachers")({
  head: () => ({ meta: [{ title: "Teachers — Analysis" }] }),
  component: TeachersPage,
});

function TeachersPage() {
  const { profile, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", subject: "" });
  const invite = useServerFn(inviteUserForRow);

  const q = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers")
        .select("id, full_name, email, phone, subject, user_id").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!profile?.school_id) throw new Error("No institute");
      const { error } = await supabase.from("teachers").insert({ ...form, school_id: profile.school_id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Teacher added");
      setOpen(false);
      setForm({ full_name: "", email: "", phone: "", subject: "" });
      qc.invalidateQueries({ queryKey: ["teachers"] });
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Teachers" subtitle="Manage teaching staff and their logins." />
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Add teacher</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New teacher</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
                <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
                <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                <Field label="Subject" value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} />
              </div>
              <DialogFooter><Button onClick={() => add.mutate()} disabled={!form.full_name || add.isPending}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <EntityTable
          rows={(q.data ?? []).map((t) => ({
            ...t,
            login_status: t.user_id ? "Active" : "No login",
          }))}
          loading={q.isLoading}
          columns={[
            { key: "full_name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "subject", label: "Subject" },
            { key: "login_status", label: "Login" },
          ]}
          onDelete={isAdmin ? (id) => del.mutate(id) : undefined}
          actions={
            isAdmin
              ? (row) => {
                  const r = row as { id: string; email: string | null; user_id: string | null };
                  if (r.user_id) {
                    return (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <Check className="h-3 w-3" /> Invited
                      </span>
                    );
                  }
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!r.email || sendInvite.isPending}
                      onClick={() => sendInvite.mutate(r.id)}
                    >
                      <Mail className="mr-1 h-3 w-3" />
                      Invite
                    </Button>
                  );
                }
              : undefined
          }
          empty="No teachers yet."
        />
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
