import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, EntityTable } from "./_authenticated.classes";
import { Field } from "./_authenticated.teachers";

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

  const q = useQuery({
    queryKey: ["parents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parents")
        .select("id, full_name, email, phone, relationship").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!profile?.school_id) throw new Error("No school");
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Parents" subtitle="Manage parent/guardian contacts." />
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
          rows={q.data ?? []}
          loading={q.isLoading}
          columns={[
            { key: "full_name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "relationship", label: "Relationship" },
          ]}
          onDelete={isAdmin ? (id) => del.mutate(id) : undefined}
          empty="No parents added yet."
        />
      </div>
    </div>
  );
}
