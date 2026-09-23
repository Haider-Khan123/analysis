import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./login";

import { getUserErrorMessage } from "@/lib/user-error";
export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Analysis" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  // Supabase will deliver users here with a recovery / invite token in the URL hash.
  // The client picks it up automatically via onAuthStateChange.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // Also handle the case where the session is already active by the time we mount
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Password Mismatch");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(getUserErrorMessage(error));
      return;
    }
    toast.success("Password updated. You're signed in.");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <AuthShell
      title="Set a new password"
      subtitle={ready ? "Choose a strong password to secure your account." : "Verifying your reset link…"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">
            New password <span className="text-destructive">*</span>
          </Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">
            Confirm password <span className="text-destructive">*</span>
          </Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="Re-enter your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {confirm && confirm !== password && (
            <p className="text-xs font-medium text-destructive">Password Mismatch</p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={busy || !ready}>
          {busy ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
