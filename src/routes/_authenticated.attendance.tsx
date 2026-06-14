import { createFileRoute, Outlet, Link, useLocation, redirect } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendanceLayout,
  beforeLoad: ({ context }) => {
    const roles = (context as any)?.roles ?? [];
    const isAdmin = roles.includes("admin");
    const isTeacher = roles.includes("teacher") && !isAdmin;
    const isParent = roles.includes("parent") && !isAdmin && !isTeacher;
    if (isParent) {
      throw redirect({ to: "/attendance/history" });
    }
  },
});

function AttendanceLayout() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const { pathname } = useLocation();

  const tabs = [
    { to: "/attendance/mark", label: "Mark Attendance" },
    { to: "/attendance/history", label: "History" },
    { to: "/attendance/reports", label: "Reports" },
    ...(isAdmin ? [{ to: "/attendance/settings", label: "Settings" }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance Management</h1>
        <p className="text-sm text-muted-foreground">Mark, review, and report on student attendance.</p>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.to);
          return (
            <Link key={t.to} to={t.to}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}>
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
