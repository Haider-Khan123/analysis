import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2, Building2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  createSchoolForAdmin,
  getMySchool,
  updateMySchool,
  deleteMySchool,
} from "@/lib/school.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/school-profile")({
  head: () => ({ meta: [{ title: "School Profile — Analysis" }] }),
  component: SchoolProfilePage,
});

const Req = () => <span className="text-destructive">*</span>;

function SchoolProfilePage() {
  const { roles, isAuthenticated, refresh } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createSchool = useServerFn(createSchoolForAdmin);
  const fetchSchool = useServerFn(getMySchool);
  const updateSchool = useServerFn(updateMySchool);
  const deleteSchool = useServerFn(deleteMySchool);
  const isAdmin = roles.includes("admin") || roles.length === 0;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-school"],
    queryFn: () => fetchSchool(),
    enabled: isAuthenticated,
  });
  const school = data?.school ?? null;

  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [phone, setPhone] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (school) {
      setName(school.name);
      setBranch(school.branch ?? "");
      setPhone(school.phone ?? "");
      setLogoDataUrl(school.logo_url);
    } else {
      setName("");
      setBranch("");
      setPhone("");
      setLogoDataUrl(null);
    }
  }, [school]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast.error("Logo must be under 500KB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const refreshAll = async () => {
    await refresh();
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["my-school"] }),
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] }),
    ]);
    await refetch();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await createSchool({
        data: { schoolName: name, phone, branch, logoDataUrl },
      });
      if (!res.ok) throw new Error(res.error);
      toast.success("Institute created.");
      await refreshAll();
      setEditMode(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create institute");
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    setSaving(true);
    try {
      const res = await updateSchool({
        data: {
          name,
          branch: branch || null,
          phone: phone || null,
          logoDataUrl,
        },
      });
      if (!res.ok) throw new Error(res.error);
      toast.success("Institute profile updated.");
      await refreshAll();
      setEditMode(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!school) return;
    setDeleting(true);
    try {
      const res = await deleteSchool();
      if (!res.ok) throw new Error(res.error);
      toast.success("Institute deleted.");
      await refreshAll();
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  // No school yet → show create form.
  if (!school) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create Your Institute</h1>
          <p className="text-sm text-muted-foreground">
            Set up your institute profile to start managing classes, teachers, students, and parents.
          </p>
        </div>
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elegant)]"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Institution Name <Req /></Label>
            <Input id="name" required placeholder="Enter your institution name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch">Branch Name/ Code <Req /></Label>
            <Input id="branch" required placeholder="Enter branch name/ code" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Institution Phone <Req /></Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]+"
              required
              placeholder="Enter phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo">Institute Logo <Req /></Label>
            <Input id="logo" type="file" accept="image/*" required onChange={handleLogoChange} />
            {logoDataUrl && (
              <img src={logoDataUrl} alt="Logo preview" className="mt-2 h-16 w-16 rounded-md border border-border object-contain" />
            )}
            <p className="text-xs text-muted-foreground">Max 500KB.</p>
          </div>
          <Button type="submit" className="w-full" disabled={creating}>
            {creating ? "Creating…" : "Create Institute"}
          </Button>
        </form>
      </div>
    );
  }

  // School exists → show details card with Edit/Delete. Edit toggles inline form.
  if (!editMode) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">School Profile</h1>
            <p className="text-sm text-muted-foreground">
              Your institute's information.
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={deleting}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this institute?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. All institute data, classes,
                      students, teachers, and parents under this institute will be
                      removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>
                      Yes, delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elegant)]">
          <div className="flex items-center gap-5">
            {school.logo_url ? (
              <img
                src={school.logo_url}
                alt={`${school.name} logo`}
                className="h-24 w-24 rounded-xl border border-border object-contain bg-background"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-border bg-muted">
                <Building2 className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-semibold truncate">{school.name}</h2>
              {school.branch && (
                <p className="text-sm text-muted-foreground">Branch: {school.branch}</p>
              )}
              {school.phone && (
                <p className="text-sm text-muted-foreground">Phone: {school.phone}</p>
              )}
              {school.email && (
                <p className="text-sm text-muted-foreground">Email: {school.email}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Edit mode form.
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit School Profile</h1>
        <p className="text-sm text-muted-foreground">Update your institute's information.</p>
      </div>

      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elegant)]"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Institution Name <Req /></Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="branch">Branch Name/ Code <Req /></Label>
          <Input id="branch" required value={branch} onChange={(e) => setBranch(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Institution Phone <Req /></Label>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]+"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="logo">Institute Logo</Label>
          {logoDataUrl && (
            <img
              src={logoDataUrl}
              alt="Institute logo"
              className="h-20 w-20 rounded-md border border-border object-contain"
            />
          )}
          <Input id="logo" type="file" accept="image/*" onChange={handleLogoChange} />
          <p className="text-xs text-muted-foreground">Max 500KB.</p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditMode(false);
              // Reset form fields to current school values.
              setName(school.name);
              setBranch(school.branch ?? "");
              setPhone(school.phone ?? "");
              setLogoDataUrl(school.logo_url);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
