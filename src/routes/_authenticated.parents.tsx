import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Mail, Check, Link2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, EntityTable } from "./_authenticated.classes";
import { Field } from "./_authenticated.teachers";
import { inviteUserForRow } from "@/lib/school.functions";

export const Route = createFileRoute("/_authenticated/parents")({
  head: () => ({ meta: [{ title: "Parents — Analysis" }] }),
  component: ParentsPage,
});

function ParentsPage() {
  const { profile, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", relationship: "" });
  const [linkOpenFor, setLinkOpenFor] = useState<string | null>(null);
  const invite = useServerFn(inviteUserForRow);

  const q = useQuery({
    queryKey: ["parents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parents")
        .select("id, full_name, email, phone, relationship, user_id").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!profile?.school_id) throw new Error("No institute");
      const { error } = await supabase.from("parents").insert({ ...form, school_id: profile.school_id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Parent added");
      setOpen(false);
      setForm({ full_name: "", email: "", phone: "", relationship: "" });
      qc.invalidateQueries({ queryKey: ["parents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Parent removed");
      qc.invalidateQueries({ queryKey: ["parents"] });
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Parents" subtitle="Manage parent/guardian contacts and their child links." />
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Add parent</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New parent</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
                <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
                <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                <Field label="Relationship" value={form.relationship} onChange={(v) => setForm({ ...form, relationship: v })} />
              </div>
              <DialogFooter><Button onClick={() => add.mutate()} disabled={!form.full_name || add.isPending}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <EntityTable
          rows={(q.data ?? []).map((p) => ({ ...p, login_status: p.user_id ? "Active" : "No login" }))}
          loading={q.isLoading}
          columns={[
            { key: "full_name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "relationship", label: "Relationship" },
            { key: "login_status", label: "Login" },
          ]}
          onDelete={isAdmin ? (id) => del.mutate(id) : undefined}
          actions={
            isAdmin
              ? (row) => {
                  const r = row as { id: string; email: string | null; user_id: string | null };
                  return (
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setLinkOpenFor(r.id)}>
                        <Link2 className="mr-1 h-3 w-3" /> Children
                      </Button>
                      {r.user_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <Check className="h-3 w-3" /> Invited
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!r.email || sendInvite.isPending}
                          onClick={() => sendInvite.mutate(r.id)}
                        >
                          <Mail className="mr-1 h-3 w-3" /> Invite
                        </Button>
                      )}
                    </div>
                  );
                }
              : undefined
          }
          empty="No parents added yet."
        />
      </div>

      {linkOpenFor && (
        <ChildrenLinkDialog
          parentId={linkOpenFor}
          parentName={q.data?.find((p) => p.id === linkOpenFor)?.full_name ?? "Parent"}
          onClose={() => setLinkOpenFor(null)}
        />
      )}
    </div>
  );
}

function ChildrenLinkDialog({
  parentId,
  parentName,
  onClose,
}: {
  parentId: string;
  parentName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");

  const studentsQ = useQuery({
    queryKey: ["students-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_number")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const linksQ = useQuery({
    queryKey: ["parent_students", parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parent_students")
        .select("id, student_id")
        .eq("parent_id", parentId);
      if (error) throw error;
      return data;
    },
  });

  const link = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a student");
      const { error } = await supabase
        .from("parent_students")
        .insert({ parent_id: parentId, student_id: selected });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Child linked");
      setSelected("");
      qc.invalidateQueries({ queryKey: ["parent_students", parentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parent_students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Child unlinked");
      qc.invalidateQueries({ queryKey: ["parent_students", parentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkedIds = new Set((linksQ.data ?? []).map((l) => l.student_id));
  const available = (studentsQ.data ?? []).filter((s) => !linkedIds.has(s.id));
  const linkedRows = (studentsQ.data ?? []).filter((s) => linkedIds.has(s.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Children of {parentName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Linked students</p>
            {linkedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No children linked yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {linkedRows.map((s) => {
                  const link = linksQ.data?.find((l) => l.student_id === s.id);
                  return (
                    <li key={s.id} className="flex items-center justify-between p-3 text-sm">
                      <div>
                        <p className="font-medium">{s.full_name}</p>
                        {s.admission_number && (
                          <p className="text-xs text-muted-foreground">#{s.admission_number}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => link && unlink.mutate(link.id)}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Add a child</p>
            <div className="flex gap-2">
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  {available.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No more students to link.
                    </div>
                  ) : (
                    available.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                        {s.admission_number ? ` (#${s.admission_number})` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button onClick={() => link.mutate()} disabled={!selected || link.isPending}>
                Link
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
