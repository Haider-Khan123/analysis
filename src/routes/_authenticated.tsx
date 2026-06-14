import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard, GraduationCap, Users, UserCog, School, Building2,
  LogOut, Menu, Lock, ShieldCheck, ClipboardCheck, Bell, BookOpen, TrendingUp, Megaphone,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getDashboardStats } from "@/lib/school.functions";
import { listMyNotifications } from "@/lib/notifications.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, gate: null },
] as const;

const schoolMgmtNav = [
  { to: "/school-profile", label: "School Profile", icon: Building2, gate: null },
  { to: "/users", label: "User Management", icon: ShieldCheck, gate: null, adminOnly: true as const },
] as const;

const adminNav = [
  { to: "/classes", label: "Classes & Sections", icon: School, gate: "institute" as const },
  { to: "/teachers", label: "Teachers", icon: UserCog, gate: "classes" as const },
  { to: "/students", label: "Students", icon: GraduationCap, gate: "teachers" as const },
  { to: "/parents", label: "Parents", icon: Users, gate: "students" as const },
] as const;

const attendanceNav: ReadonlyArray<{ to: string; label: string; adminOnly?: boolean }> = [
  { to: "/attendance/mark", label: "Mark Attendance" },
  { to: "/attendance/history", label: "Attendance History" },
  { to: "/attendance/reports", label: "Attendance Reports" },
  { to: "/attendance/settings", label: "Attendance Settings", adminOnly: true },
];

const homeworkNav: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/homework/create", label: "Create Homework" },
  { to: "/homework/list", label: "Homework List" },
  { to: "/homework/history", label: "History" },
  { to: "/homework/reports", label: "Reports" },
];

const progressNav: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/progress/observations", label: "Daily Observations" },
  { to: "/progress/behavior", label: "Behavior" },
  { to: "/progress/participation", label: "Participation" },
  { to: "/progress/academic", label: "Academic Remarks" },
  { to: "/progress/history", label: "Progress History" },
  { to: "/progress/reports", label: "Reports" },
];

const announcementNav: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/announcements/view", label: "View Announcements" },
  { to: "/announcements/create", label: "Create Announcement" },
  { to: "/announcements/history", label: "Announcement History" },
  { to: "/announcements/categories", label: "Announcement Categories" },
];

const parentAnnouncementNav: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/parent-announcements", label: "View Announcements" },
];

const gateMessages: Record<string, string> = {
  institute: "Create your institute in School Profile first.",
  classes: "Add at least one class & section first.",
  teachers: "Add at least one teacher first.",
  students: "Enroll at least one student first.",
};

function AuthenticatedLayout() {
  const { isAuthenticated, loading, profile, roles, signOut, session, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isAdmin = roles.includes("admin");
  const isTeacher = roles.includes("teacher") && !isAdmin;
  const isParent = roles.includes("parent") && !isAdmin && !isTeacher;
  const fetchStats = useServerFn(getDashboardStats);
  const fetchNotifs = useServerFn(listMyNotifications);

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
    enabled: isAuthenticated && !!session?.access_token && !isTeacher && !isParent,
  });

  const { data: notifData } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchNotifs(),
    enabled: isAuthenticated && !!session?.access_token,
  });
  const unread = (notifData?.notifications ?? []).filter((n) => !n.is_read).length;

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel("notif-layout-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["my-notifications"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, queryClient]);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    await navigate({ to: "/login", replace: true });
  };

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate({ to: "/login", replace: true });
  }, [isAuthenticated, loading, navigate]);

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const role = roles[0] ?? "admin";
  const counts = stats?.counts ?? { institute: 0, classes: 0, teachers: 0, students: 0, parents: 0 };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col border-r border-border bg-sidebar md:flex">
        <SidebarContent role={role} isAdmin={isAdmin} isTeacher={isTeacher} isParent={isParent} pathname={location.pathname} counts={counts} />
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
                <SheetHeader className="sr-only"><SheetTitle>Navigation</SheetTitle></SheetHeader>
                <SidebarContent role={role} isAdmin={isAdmin} isTeacher={isTeacher} isParent={isParent} pathname={location.pathname} counts={counts} />
              </SheetContent>
            </Sheet>
            <div>
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="text-sm font-medium">{profile?.full_name ?? profile?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/notifications" className="relative">
              <Button variant="ghost" size="icon">
                <Bell className="h-5 w-5" />
              </Button>
              {unread > 0 && (
                <Badge variant="destructive" className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1 text-[10px]">
                  {unread > 99 ? "99+" : unread}
                </Badge>
              )}
            </Link>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary">{role}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
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
  role, isAdmin, isTeacher, isParent, pathname, counts,
}: {
  role: string; isAdmin: boolean; isTeacher: boolean; isParent: boolean;
  pathname: string;
  counts: { institute: number; classes: number; teachers: number; students: number; parents: number };
}) {
  const isOnboarding = role === "admin" || !role;
  const visible = nav.filter((item) => {
    if (isParent) return ["/dashboard"].includes(item.to);
    if (isTeacher) return ["/dashboard"].includes(item.to);
    if (isOnboarding) return true;
    return ["/dashboard"].includes(item.to);
  });

  const showAttendance = isAdmin || isTeacher || isParent;
  const showAdministration = isAdmin || isTeacher;
  const showSchoolMgmt = isAdmin;
  const schoolMgmtItems = schoolMgmtNav.filter((i) => isAdmin || !("adminOnly" in i && i.adminOnly));
  const attItems = attendanceNav.filter((i) => isAdmin || !i.adminOnly);
  const onAttendance = pathname.startsWith("/attendance");
  const [attOpen, setAttOpen] = useState(onAttendance);
  useEffect(() => { if (onAttendance) setAttOpen(true); }, [onAttendance]);

  const showHomework = isAdmin || isTeacher;
  const onHomework = pathname.startsWith("/homework");
  const [hwOpen, setHwOpen] = useState(onHomework);
  useEffect(() => { if (onHomework) setHwOpen(true); }, [onHomework]);

  const showProgress = isAdmin || isTeacher;
  const onProgress = pathname.startsWith("/progress");
  const [prOpen, setPrOpen] = useState(onProgress);
  useEffect(() => { if (onProgress) setPrOpen(true); }, [onProgress]);

  const showAnnouncements = isAdmin || isTeacher;
  const onAnnouncements = pathname.startsWith("/announcements") || pathname.startsWith("/parent-announcements");
  const [anOpen, setAnOpen] = useState(onAnnouncements);
  useEffect(() => { if (onAnnouncements) setAnOpen(true); }, [onAnnouncements]);

  const isLocked = (gate: string | null) => {
    if (!gate || !isOnboarding) return false;
    return (counts as Record<string, number>)[gate] < 1;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">A</div>
        <span className="text-lg font-semibold tracking-tight">Analysis</span>
      </div>
      <TooltipProvider delayDuration={150}>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visible.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            const locked = isLocked(item.gate);
            if (locked) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <div aria-disabled className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/60">
                      <Icon className="h-4 w-4" /><span className="flex-1">{item.label}</span><Lock className="h-3.5 w-3.5" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">{gateMessages[item.gate ?? ""] ?? "Complete the previous step first."}</TooltipContent>
                </Tooltip>
              );
            }
            return (
              <Link key={item.to} to={item.to}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent")}>
                <Icon className="h-4 w-4" />{item.label}
              </Link>
            );
          })}

          {showSchoolMgmt && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">School Management</p>
              {schoolMgmtItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.to;
                return (
                  <Link key={item.to} to={item.to}
                    className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent")}>
                    <Icon className="h-4 w-4" />{item.label}
                  </Link>
                );
              })}
            </div>
          )}

          {showAdministration && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Administration</p>
              {adminNav.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.to;
                const locked = isLocked(item.gate);
                if (locked) {
                  return (
                    <Tooltip key={item.to}>
                      <TooltipTrigger asChild>
                        <div aria-disabled className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/60">
                          <Icon className="h-4 w-4" /><span className="flex-1">{item.label}</span><Lock className="h-3.5 w-3.5" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">{gateMessages[item.gate ?? ""] ?? "Complete the previous step first."}</TooltipContent>
                    </Tooltip>
                  );
                }
                return (
                  <Link key={item.to} to={item.to}
                    className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent")}>
                    <Icon className="h-4 w-4" />{item.label}
                  </Link>
                );
              })}
            </div>
          )}

          {showAttendance && !isParent && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance</p>
              <button
                type="button"
                onClick={() => setAttOpen((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium",
                  onAttendance ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
                aria-expanded={attOpen}
              >
                <ClipboardCheck className="h-4 w-4" />
                <span className="flex-1">Attendance Management</span>
                <span className={cn("text-xs transition-transform", attOpen ? "rotate-90" : "")}>›</span>
              </button>
              {attOpen && (
                <div className="ml-7 mt-1 space-y-0.5 border-l border-border pl-3">
                  {attItems.map((i) => (
                    <Link key={i.to} to={i.to}
                      className={cn("block rounded-md px-2 py-1 text-xs",
                        pathname === i.to ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}>
                      {i.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {showHomework && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Academics</p>
              <button
                type="button"
                onClick={() => setHwOpen((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium",
                  onHomework ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
                aria-expanded={hwOpen}
              >
                <BookOpen className="h-4 w-4" />
                <span className="flex-1">Homework Management</span>
                <span className={cn("text-xs transition-transform", hwOpen ? "rotate-90" : "")}>›</span>
              </button>
              {hwOpen && (
                <div className="ml-7 mt-1 space-y-0.5 border-l border-border pl-3">
                  {homeworkNav.map((i) => (
                    <Link key={i.to} to={i.to}
                      className={cn("block rounded-md px-2 py-1 text-xs",
                        pathname === i.to ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}>
                      {i.label}
                    </Link>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setPrOpen((v) => !v)}
                className={cn(
                  "mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium",
                  onProgress ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
                aria-expanded={prOpen}
              >
                <TrendingUp className="h-4 w-4" />
                <span className="flex-1">Student Progress</span>
                <span className={cn("text-xs transition-transform", prOpen ? "rotate-90" : "")}>›</span>
              </button>
              {prOpen && (
                <div className="ml-7 mt-1 space-y-0.5 border-l border-border pl-3">
                  {progressNav.map((i) => (
                    <Link key={i.to} to={i.to}
                      className={cn("block rounded-md px-2 py-1 text-xs",
                        pathname === i.to ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}>
                      {i.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {isParent && (
            <>
              <div className="pt-3">
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance</p>
                <Link to="/attendance/history"
                  className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    pathname.startsWith("/attendance") ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent")}>
                  <ClipboardCheck className="h-4 w-4" /> My Children's Attendance
                </Link>
              </div>
              <div className="pt-3">
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Academics</p>
                <Link to="/parent-homework"
                  className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    pathname.startsWith("/parent-homework") ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent")}>
                  <BookOpen className="h-4 w-4" /> Homework
                </Link>
                <Link to="/parent-progress"
                  className={cn("mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    pathname.startsWith("/parent-progress") ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent")}>
                  <TrendingUp className="h-4 w-4" /> Student Progress
                </Link>
              </div>
            </>
          )}

          {showAnnouncements && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Announcement</p>
              <button
                type="button"
                onClick={() => setAnOpen((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium",
                  onAnnouncements ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
                aria-expanded={anOpen}
              >
                <Megaphone className="h-4 w-4" />
                <span className="flex-1">Announcements</span>
                <span className={cn("text-xs transition-transform", anOpen ? "rotate-90" : "")}>›</span>
              </button>
              {anOpen && (
                <div className="ml-7 mt-1 space-y-0.5 border-l border-border pl-3">
                  {announcementNav.map((i) => (
                    <Link key={i.to} to={i.to}
                      className={cn("block rounded-md px-2 py-1 text-xs",
                        pathname === i.to ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}>
                      {i.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {isParent && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Announcement</p>
              <button
                type="button"
                onClick={() => setAnOpen((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium",
                  onAnnouncements || pathname.startsWith("/parent-announcements") ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
                aria-expanded={anOpen}
              >
                <Megaphone className="h-4 w-4" />
                <span className="flex-1">Announcements</span>
                <span className={cn("text-xs transition-transform", anOpen ? "rotate-90" : "")}>›</span>
              </button>
              {anOpen && (
                <div className="ml-7 mt-1 space-y-0.5 border-l border-border pl-3">
                  {parentAnnouncementNav.map((i) => (
                    <Link key={i.to} to={i.to}
                      className={cn("block rounded-md px-2 py-1 text-xs",
                        pathname === i.to ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}>
                      {i.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-3">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</p>
            <Link to="/notifications"
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                pathname === "/notifications" ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent")}>
              <Bell className="h-4 w-4" /> Notifications
            </Link>
          </div>
        </nav>
      </TooltipProvider>
    </div>
  );
}
