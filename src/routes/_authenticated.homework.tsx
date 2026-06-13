import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/homework")({
  component: HomeworkLayout,
});

function HomeworkLayout() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const isTeacher = roles.includes("teacher");
  const { pathname } = useLocation();

  const tabs = [
    ...(isAdmin || isTeacher ? [{ to: "/homework/create", label: "Create Homework" }] : []),
    { to: "/homework/list", label: "Homework List" },
    { to: "/homework/history", label: "History" },
    { to: "/homework/reports", label: "Reports" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Homework Management</h1>
        <p className="text-sm text-muted-foreground">Create, assign, and track homework.</p>
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
