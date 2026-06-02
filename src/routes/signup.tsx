import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { createSchoolForAdmin } from "@/lib/school.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create Your Institute! — Analysis" },
      { name: "description", content: "Set up your institute on Analysis in under a minute." },
    ],
  }),
  component: SignupPage,
});

const Req = () => <span className="text-destructive">*</span>;

function SignupPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading, refresh } = useAuth();
  const createSchool = useServerFn(createSchoolForAdmin);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [phone, setPhone] = useState("");
  const [branch, setBranch] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Password Mismatch");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { full_name: fullName },
        },
      });
      if (error) throw error;
      if (!data.session) {
        toast.success("Check your email to confirm your account.");
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
      const res = await createSchool({
        data: { schoolName, phone, branch, logoDataUrl },
      });
      if (!res.ok) throw new Error(res.error);
      await refresh();
      toast.success("Institute created. Welcome!");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signup failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create Your Institute!" subtitle="You'll become the institute administrator.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name <Req /></Label>
          <Input
            id="fullName"
            required
            placeholder="Enter your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email <Req /></Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="xyz@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password <Req /></Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password <Req /></Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {confirmPassword && confirmPassword !== password && (
            <p className="text-xs font-medium text-destructive">Password Mismatch</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="schoolName">Institution Name <Req /></Label>
          <Input
            id="schoolName"
            required
            placeholder="Enter your institution name"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
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
            placeholder="Enter phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="branch">Branch Name/ Code <Req /></Label>
          <Input
            id="branch"
            required
            placeholder="Enter branch name/ code"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="logo">Institute Logo <Req /></Label>
          <Input
            id="logo"
            type="file"
            accept="image/*"
            required
            onChange={handleLogoChange}
          />
          {logoDataUrl && (
            <img
              src={logoDataUrl}
              alt="Logo preview"
              className="mt-2 h-16 w-16 rounded-md border border-border object-contain"
            />
          )}
          <p className="text-xs text-muted-foreground">Max 500KB.</p>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create Institute"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
