import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { createSchoolForAdmin } from "@/lib/school.functions";
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

type SchoolRow = {
  id: string;
  name: string;
  branch: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  logo_url: string | null;
};

function SchoolProfilePage() {
  const { roles, refresh } = useAuth();
  const navigate = useNavigate();
  const createSchool = useServerFn(createSchoolForAdmin);
  const isAdmin = roles.includes("admin") || roles.length === 0; // new users with no role yet can create

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [school, setSchool] = useState<SchoolRow | null>(null);

  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [phone, setPhone] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: profile } = await supabase.auth.getUser();
    const userId = profile.user?.id;
    if (!userId) return setLoading(false);
    const { data: prof } = await supabase
      .from("profiles")
      .select("school_id")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.school_id) {
      setSchool(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("schools")
      .select("id, name, branch, phone, address, email, logo_url")
      .eq("id", prof.school_id)
      .maybeSingle();
    if (error) toast.error(error.message);
    if (data) {
      setSchool(data);
      setName(data.name);
      setBranch(data.branch ?? "");
      setPhone(data.phone ?? "");
      setLogoDataUrl(data.logo_url);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await createSchool({
        data: { schoolName: name, phone, branch, logoDataUrl },
      });
      if (!res.ok) throw new Error(res.error);
      await refresh();
      toast.success("Institute created.");
      load();
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
    const { error } = await supabase
      .from("schools")
      .update({
        name,
        branch: branch || null,
        phone: phone || null,
        logo_url: logoDataUrl,
      })
      .eq("id", school.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Institute profile updated.");
    load();
  };

  const handleDelete = async () => {
    if (!school) return;
    setDeleting(true);
    const { error } = await supabase.from("schools").delete().eq("id", school.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Institute deleted.");
    await refresh();
    navigate({ to: "/signup", replace: true });
  };

  if (loading) {
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
          Manage your institute's information. {!isAdmin && "Admins can edit or delete."}
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
