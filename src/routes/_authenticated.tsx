import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  UserCog,
  School,
  Building2,
  LogOut,
  Menu,
  Lock,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getDashboardStats } from "@/lib/school.functions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetHeader,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, gate: null },
  { to: "/school-profile", label: "School Profile", icon: Building2, gate: null },
  { to: "/classes", label: "Classes & Sections", icon: School, gate: "institute" as const },
  { to: "/teachers", label: "Teachers", icon: UserCog, gate: "classes" as const },
  { to: "/students", label: "Students", icon: GraduationCap, gate: "teachers" as const },
  { to: "/parents", label: "Parents", icon: Users, gate: "students" as const },
] as const;

const gateMessages: Record<string, string> = {
  institute: "Create your institute in School Profile first.",
  classes: "Add at least one class & section first.",
  teachers: "Add at least one teacher first.",
  students: "Enroll at least one student first.",
};

function AuthenticatedLayout() {
  const { isAuthenticated, loading, profile, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fetchStats = useServerFn(getDashboardStats);
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate({ to: "/login", replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const role = roles[0] ?? "parent";
  const counts = stats?.counts ?? { institute: 0, classes: 0, teachers: 0, students: 0, parents: 0 };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col border-r border-border bg-sidebar md:flex">
        <SidebarContent role={role} pathname={location.pathname} counts={counts} />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <SidebarContent role={role} pathname={location.pathname} counts={counts} />
              </SheetContent>
            </Sheet>
            <div>
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="text-sm font-medium">{profile?.full_name ?? profile?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary">
              {role}
            </span>
            <Button variant="ghost" size="sm" onClick={() => signOut().then(() => navigate({ to: "/" }))}>
              <LogOut className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  role,
  pathname,
  counts,
}: {
  role: string;
  pathname: string;
  counts: { institute: number; classes: number; teachers: number; students: number; parents: number };
}) {
  // Admins (and users with no role yet, i.e. fresh onboarding) see every tab.
  // Teachers/parents see a limited subset.
  const isOnboarding = role === "admin" || !role || roles.length === 0;
  const visible = nav.filter((item) => {
    if (isOnboarding) return true;
    if (role === "teacher")
      return ["/dashboard", "/students", "/classes", "/school-profile"].includes(item.to);
    return ["/dashboard", "/students", "/school-profile"].includes(item.to);
  });

  const isLocked = (gate: string | null) => {
    if (!gate) return false;
    if (!isOnboarding) return false; // gating only applies during admin onboarding
    return (counts as Record<string, number>)[gate] < 1;
  };



  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          A
        </div>
        <span className="text-lg font-semibold tracking-tight">Analysis</span>
      </div>
      <TooltipProvider delayDuration={150}>
        <nav className="flex-1 space-y-1 p-3">
          {visible.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            const locked = isLocked(item.gate);

            if (locked) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <div
                      aria-disabled
                      className={cn(
                        "flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                        "text-muted-foreground/60",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{item.label}</span>
                      <Lock className="h-3.5 w-3.5" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {gateMessages[item.gate ?? ""] ?? "Complete the previous step first."}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </TooltipProvider>
    </div>
  );
}
