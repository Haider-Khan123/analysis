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
      { title: "Create your school — Analysis" },
      { name: "description", content: "Set up your school on Analysis in under a minute." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading, refresh } = useAuth();
  const createSchool = useServerFn(createSchoolForAdmin);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      // Already signed in — just redirect to dashboard
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        // email confirmation required
        toast.success("Check your email to confirm your account.");
        return;
      }
      // wait briefly for the auth state to settle, then create the school
      await new Promise((r) => setTimeout(r, 400));
      const res = await createSchool({ data: { schoolName, phone: phone || null } });
      if (!res.ok) throw new Error(res.error);
      await refresh();
      toast.success("School created. Welcome!");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signup failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your school" subtitle="You'll become the school administrator.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Your name</Label>
          <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="schoolName">School name</Label>
          <Input id="schoolName" required value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">School phone (optional)</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create school"}
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
