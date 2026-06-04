import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [phone, setPhone] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  // Sync local form state when the school loads/changes.
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
          logoDataUrl: logoDataUrl,
        },
      });
      if (!res.ok) throw new Error(res.error);
      toast.success("Institute profile updated.");
      await refreshAll();
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">School Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your institute's information.{!isAdmin && " Admins can edit or delete."}
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elegant)]"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Institution Name <Req /></Label>
          <Input
            id="name"
            required
            disabled={!isAdmin}
            placeholder="Enter your institution name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="branch">Branch Name/ Code <Req /></Label>
          <Input
            id="branch"
            required
            disabled={!isAdmin}
            placeholder="Enter branch name/ code"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Institution Phone <Req /></Label>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]+"
            required
            disabled={!isAdmin}
            placeholder="Enter phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="logo">Institute Logo <Req /></Label>
          {logoDataUrl && (
            <img
              src={logoDataUrl}
              alt="Institute logo"
              className="h-20 w-20 rounded-md border border-border object-contain"
            />
          )}
          {isAdmin && (
            <Input id="logo" type="file" accept="image/*" onChange={handleLogoChange} />
          )}
          <p className="text-xs text-muted-foreground">Max 500KB.</p>
        </div>

        {isAdmin && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete Institute"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this institute?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. All institute data, classes, students,
                    teachers, and parents under this institute will be removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Yes, delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
