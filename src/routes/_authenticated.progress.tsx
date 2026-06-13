import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/progress")({
  component: ProgressLayout,
});

function ProgressLayout() {
  const { pathname } = useLocation();
  const tabs = [
    { to: "/progress/observations", label: "Daily Observations" },
    { to: "/progress/behavior", label: "Behavior" },
    { to: "/progress/participation", label: "Participation" },
    { to: "/progress/academic", label: "Academic Remarks" },
    { to: "/progress/history", label: "Progress History" },
    { to: "/progress/reports", label: "Reports" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Student Progress Tracking</h1>
        <p className="text-sm text-muted-foreground">Record observations, behavior, participation, and academic feedback.</p>
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
