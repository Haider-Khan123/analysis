import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Save, Plus, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { titleCase } from "@/lib/utils";
import {
  ParentForm, parentFromRow, validateParent, type ParentFormValues,
} from "@/components/parent-form";
import {
  getParentDetail, updateParent, linkStudent, unlinkStudent, updateLink,
  RELATIONSHIP_TYPES, type RelationshipType,
} from "@/lib/parents.functions";

export const Route = createFileRoute("/_authenticated/parents/$parentId")({
  head: ({ params }) => ({ meta: [{ title: `Parent · ${params.parentId.slice(0, 8)}` }] }),
  component: ParentProfilePage,
});

function ParentProfilePage() {
  const { parentId } = Route.useParams();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.length === 0;
  const qc = useQueryClient();

  const fetchDetail = useServerFn(getParentDetail);
  const updateFn = useServerFn(updateParent);
  const linkFn = useServerFn(linkStudent);
  const unlinkFn = useServerFn(unlinkStudent);
  const updateLinkFn = useServerFn(updateLink);

  const detailQ = useQuery({
    queryKey: ["parent-detail", parentId],
    queryFn: () => fetchDetail({ data: { id: parentId } }),
  });
  const studentsQ = useQuery({
    queryKey: ["students-all"],
    queryFn: async () => (await supabase.from("students")
      .select("id, full_name, admission_number, attendance_id").order("full_name")).data ?? [],
  });
  const classesQ = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("id, name").order("name")).data ?? [],
  });
  const sectionsQ = useQuery({
    queryKey: ["sections"],
    queryFn: async () => (await supabase.from("sections").select("id, name, class_id").order("name")).data ?? [],
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<ParentFormValues | null>(null);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkStudentId, setLinkStudentId] = useState("");
  const [linkRelationship, setLinkRelationship] = useState<RelationshipType>("son");
  const [linkPrimary, setLinkPrimary] = useState(false);

  const update = useMutation({
    mutationFn: async (v: ParentFormValues) => {
      const err = validateParent(v, { requireLogin: false });
      if (err) throw new Error(err);
      const res = await updateFn({
        data: {
          id: parentId,
          parent_id: v.parent_id,
          first_name: v.first_name, last_name: v.last_name,
          phone: v.phone, alternate_phone: v.alternate_phone || null,
          email: v.email || null, cnic: v.cnic || null,
          occupation: v.occupation || null, address: v.address || null,
          city: v.city || null, photo_data_url: v.photo_data_url,
          status: v.status,
        },
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Parent updated");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["parent-detail", parentId] });
      qc.invalidateQueries({ queryKey: ["parents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const link = useMutation({
    mutationFn: async () => {
      if (!linkStudentId) throw new Error("Select a student");
      const res = await linkFn({ data: {
        parent_id: parentId, student_id: linkStudentId,
        relationship_type: linkRelationship, is_primary: linkPrimary,
      } });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Student linked");
      setLinkOpen(false); setLinkStudentId(""); setLinkRelationship("son"); setLinkPrimary(false);
      qc.invalidateQueries({ queryKey: ["parent-detail", parentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = useMutation({
    mutationFn: async (link_id: string) => {
      const res = await unlinkFn({ data: { link_id } });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Link removed");
      qc.invalidateQueries({ queryKey: ["parent-detail", parentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updLink = useMutation({
    mutationFn: async (vars: { link_id: string; relationship_type?: RelationshipType; is_primary?: boolean }) => {
      const res = await updateLinkFn({ data: vars });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parent-detail", parentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const classMap = useMemo(() => new Map((classesQ.data ?? []).map((c) => [c.id, c.name])), [classesQ.data]);
  const sectionMap = useMemo(() => new Map((sectionsQ.data ?? []).map((s) => [s.id, s.name])), [sectionsQ.data]);

  if (detailQ.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!detailQ.data?.ok) return <p className="text-sm text-destructive">{detailQ.data?.error ?? "Not found"}</p>;

  const p = detailQ.data.parent as Record<string, unknown>;
  const links = detailQ.data.links as Array<{ id: string; student_id: string; relationship_type: string; is_primary: boolean }>;
  const students = detailQ.data.students as Array<{ id: string; full_name: string; admission_number: string | null; attendance_id: string | null; class_id: string | null; section_id: string | null }>;
  const studentMap = new Map(students.map((s) => [s.id, s]));

  const linkedIds = new Set(links.map((l) => l.student_id));
  const available = (studentsQ.data ?? []).filter((s) => !linkedIds.has(s.id));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/parents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back To Parents
        </Link>
        {isAdmin && (
          <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (o) setEditForm(parentFromRow(p)); }}>
            <DialogTrigger asChild><Button variant="outline"><Pencil className="mr-1 h-4 w-4" />Edit</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Edit Parent</DialogTitle></DialogHeader>
              {editForm && <ParentForm value={editForm} onChange={setEditForm} mode="edit" />}
              <DialogFooter>
                <Button onClick={() => editForm && update.mutate(editForm)} disabled={update.isPending}>
                  <Save className="mr-1 h-4 w-4" />{update.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <section className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] md:flex-row">
        <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full bg-muted">
          {p.photo_url ? <img src={p.photo_url as string} alt="" className="h-full w-full object-cover" />
            : <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">No photo</div>}
        </div>
        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
          <Item label="Parent ID" value={String(p.parent_id ?? "—")} />
          <Item label="Full Name" value={titleCase(String(p.full_name ?? ""))} />
          <Item label="Mobile Number" value={String(p.phone ?? "—")} />
          <Item label="Alternate Mobile Number" value={String(p.alternate_phone ?? "—")} />
          <Item label="Email Address" value={String(p.email ?? "—")} />
          <Item label="CNIC" value={String(p.cnic ?? "—")} />
          <Item label="Occupation" value={String(p.occupation ?? "—")} />
          <Item label="City" value={String(p.city ?? "—")} />
          <Item label="Address" value={String(p.address ?? "—")} />
          <Item label="Status" value={titleCase(String(p.status ?? "active"))} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Linked Students</h2>
          {isAdmin && (
            <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" />Link New Student</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Link Student</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Student *</Label>
                    <Select value={linkStudentId} onValueChange={setLinkStudentId}>
                      <SelectTrigger><SelectValue placeholder="Select a student" /></SelectTrigger>
                      <SelectContent>
                        {available.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">No more students to link.</div>
                        ) : available.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {titleCase(s.full_name)}{s.admission_number ? ` (#${s.admission_number})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Relationship Type *</Label>
                    <Select value={linkRelationship} onValueChange={(v) => setLinkRelationship(v as RelationshipType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIP_TYPES.map((r) => (
                          <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={linkPrimary} onCheckedChange={(c) => setLinkPrimary(c === true)} />
                    Set as Primary Guardian
                  </label>
                </div>
                <DialogFooter>
                  <Button onClick={() => link.mutate()} disabled={!linkStudentId || link.isPending}>Link</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students linked yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="py-2 pr-3 font-medium">Admission #</th>
                  <th className="py-2 pr-3 font-medium">Attendance ID</th>
                  <th className="py-2 pr-3 font-medium">Class</th>
                  <th className="py-2 pr-3 font-medium">Section</th>
                  <th className="py-2 pr-3 font-medium">Relationship</th>
                  <th className="py-2 pr-3 font-medium">Primary</th>
                  {isAdmin && <th className="py-2 text-right" />}
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const s = studentMap.get(l.student_id);
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="py-3 pr-3 font-medium">{titleCase(s?.full_name ?? "—")}</td>
                      <td className="py-3 pr-3">{s?.admission_number ?? "—"}</td>
                      <td className="py-3 pr-3">{s?.attendance_id ?? "—"}</td>
                      <td className="py-3 pr-3">{classMap.get(s?.class_id ?? "") ?? "—"}</td>
                      <td className="py-3 pr-3">{sectionMap.get(s?.section_id ?? "") ?? "—"}</td>
                      <td className="py-3 pr-3">
                        {isAdmin ? (
                          <Select
                            value={l.relationship_type}
                            onValueChange={(v) => updLink.mutate({ link_id: l.id, relationship_type: v as RelationshipType })}
                          >
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {RELATIONSHIP_TYPES.map((r) => (
                                <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : titleCase(l.relationship_type)}
                      </td>
                      <td className="py-3 pr-3">
                        {l.is_primary ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            <Star className="h-3 w-3" /> Primary
                          </span>
                        ) : isAdmin ? (
                          <Button
                            size="sm" variant="outline"
                            onClick={() => updLink.mutate({ link_id: l.id, is_primary: true })}
                          >
                            Set Primary
                          </Button>
                        ) : "—"}
                      </td>
                      {isAdmin && (
                        <td className="py-3 text-right">
                          <Button variant="ghost" size="icon" onClick={() => unlink.mutate(l.id)}>
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}
