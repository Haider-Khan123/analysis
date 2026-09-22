import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { bootstrapSuperAdmin } from "@/lib/super-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — Analysis" },
      { name: "description", content: "Sign in to your Analysis institute management dashboard." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading, roles, profile } = useAuth();
  const seed = useServerFn(bootstrapSuperAdmin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      const dest = (roles as string[]).includes("super_admin")
        ? "/super-admin/admin-management"
        : roles.includes("admin") && !profile?.school_id
          ? "/school-profile"
          : "/dashboard";
      navigate({ to: dest, replace: true });
    }
  }, [isAuthenticated, loading, roles, profile?.school_id, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    let { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // The super-admin account is seeded lazily; retry once after bootstrapping.
      try {
        await seed();
        ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
      } catch {
        // keep the original error
      }
    }

    if (error || !data?.user) {
      setBusy(false);
      toast.error(error?.message ?? "Unable to sign in");
      return;
    }

    // Resolve the destination right here so we don't wait on a second render pass.
    const userId = data.user.id;
    const [{ data: prof }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("school_id").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const myRoles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
    const dest = myRoles.includes("super_admin")
      ? "/super-admin/admin-management"
      : myRoles.includes("admin") && !(prof as { school_id: string | null } | null)?.school_id
        ? "/school-profile"
        : "/dashboard";
    setBusy(false);
    toast.success("Welcome back");
    void navigate({ to: dest, replace: true });
  };


  return (
    <AuthShell title="Welcome Back!" subtitle="Sign in to your Analysis dashboard.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="xyz@email.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">
            Password <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Contact Institute's Admin for any issue.</p>
        </div>
        <Button type="submit" className="w-full" disabled={busy || !email.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New Institute?{" "}
        <Link to="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            A
          </div>
          <span className="text-xl font-semibold tracking-tight">Analysis</span>
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elegant)]">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
