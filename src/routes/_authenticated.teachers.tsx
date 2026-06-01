import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
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

  const q = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers")
        .select("id, full_name, email, phone, subject").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!profile?.school_id) throw new Error("No school");
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Teachers" subtitle="Manage teaching staff." />
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
          rows={q.data ?? []}
          loading={q.isLoading}
          columns={[
            { key: "full_name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "subject", label: "Subject" },
          ]}
          onDelete={isAdmin ? (id) => del.mutate(id) : undefined}
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
