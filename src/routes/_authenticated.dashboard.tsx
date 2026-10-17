import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, GraduationCap, UserCog, School, Users, Layers, CalendarCheck, BookOpen, LineChart, Bell } from "lucide-react";
import { getDashboardStats } from "@/lib/school.functions";
import { getTeacherScopedData } from "@/lib/teacher-scope.functions";
import { getDashboardCounts } from "@/lib/dashboard.functions";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Analysis" }] }),
  component: Dashboard,
});

const today = () => new Date().toISOString().slice(0, 10);

function Dashboard() {
  const { profile, session, roles, loading, user } = useAuth();
  const isAdmin = roles.includes("admin");
  const isTeacher = roles.includes("teacher") && !isAdmin;
  const isParent = roles.includes("parent") && !isAdmin && !isTeacher;
  const rolesReady = !loading && roles.length > 0;

  const [from, setFrom] = useState<string>(today());
  const [to, setTo] = useState<string>(today());

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Welcome, {profile?.full_name ?? "there"}! Have a nice day.
        </h1>
      </div>

      {rolesReady && !isAdmin && (
        <DateFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      )}

      {rolesReady && !isAdmin && session?.access_token && (
        <DynamicCards from={from} to={to} userId={user?.id ?? ""} />
      )}

      {!rolesReady ? (
        <p className="text-sm text-muted-foreground">Loading your dashboard…</p>
      ) : isParent ? null : isTeacher ? (
        <TeacherDashboard enabled={!!session?.access_token} />
      ) : (
        <AdminDashboard enabled={!!session?.access_token} />
      )}
    </div>
  );
}

function DateFilter({
  from, to, onFrom, onTo,
}: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-wrap items-end justify-center gap-4 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="from">From</Label>
        <Input id="from" type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="w-44" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="to">To</Label>
        <Input id="to" type="date" value={to} onChange={(e) => onTo(e.target.value)} className="w-44" />
      </div>
    </div>
  );
}

function DynamicCards({ from, to, userId }: { from: string; to: string; userId: string }) {
  const fetchCounts = useServerFn(getDashboardCounts);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-counts", from, to],
    queryFn: () => fetchCounts({ data: { from, to } }),
  });

  // Real-time: invalidate counts on changes to relevant tables
  useEffect(() => {
    if (!userId) return;
    // Poll for changes (replaces Supabase realtime).
    const timer = setInterval(() => { void qc.invalidateQueries({ queryKey: ["dashboard-counts"] }); }, 5000);
    return () => clearInterval(timer);
  }, [userId, qc]);

  return (
    <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 justify-items-center">
      <CountCard label="Attendance" value={data?.attendance ?? 0} icon={CalendarCheck} loading={isLoading} />
      <CountCard label="Homework" value={data?.homework ?? 0} icon={BookOpen} loading={isLoading} />
      <CountCard label="Student Progress" value={data?.progress ?? 0} icon={LineChart} loading={isLoading} />
      <CountCard label="Notifications" value={data?.notifications ?? 0} icon={Bell} loading={isLoading} />
    </div>
  );
}

function CountCard({
  label, value, icon: Icon, loading,
}: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; loading?: boolean }) {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-5 text-center shadow-[var(--shadow-card)]">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums">{loading ? "—" : value}</p>
    </div>
  );
}

function AdminDashboard({ enabled }: { enabled: boolean }) {
  const fetchStats = useServerFn(getDashboardStats);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
    enabled,
  });

  return (
    <>
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Institute" value={data?.counts.institute ?? 0} icon={Building2} loading={isLoading} />
        <StatCard label="Classes" value={data?.counts.classes ?? 0} icon={School} loading={isLoading} />
        <StatCard label="Sections" value={data?.counts.sections ?? 0} icon={Layers} loading={isLoading} />
        <StatCard label="Teachers" value={data?.counts.teachers ?? 0} icon={UserCog} loading={isLoading} />
        <StatCard label="Students" value={data?.counts.students ?? 0} icon={GraduationCap} loading={isLoading} />
        <StatCard label="Parents" value={data?.counts.parents ?? 0} icon={Users} loading={isLoading} />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Get Started</h2>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li><span className="font-medium text-foreground">1.</span> Create your institute from the <span className="font-medium text-foreground">School Profile</span> tab.</li>
          <li><span className="font-medium text-foreground">2.</span> Set up your classes and sections from the <span className="font-medium text-foreground">Classes &amp; Sections</span> tab.</li>
          <li><span className="font-medium text-foreground">3.</span> Add teachers and assign them to classes and sections from the <span className="font-medium text-foreground">Teachers</span> tab.</li>
          <li><span className="font-medium text-foreground">4.</span> Enroll students into their class &amp; section from the <span className="font-medium text-foreground">Students</span> tab.</li>
          <li><span className="font-medium text-foreground">5.</span> Add parents and link them to their children from the <span className="font-medium text-foreground">Parents</span> tab.</li>
        </ol>
      </div>
    </>
  );
}

function TeacherDashboard({ enabled }: { enabled: boolean }) {
  const fetchScope = useServerFn(getTeacherScopedData);
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-scope"],
    queryFn: () => fetchScope(),
    enabled,
    refetchOnMount: "always",
    staleTime: 0,
  });

  return (
    <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4">
      <StatCard label="Classes" value={data?.counts.classes ?? 0} icon={School} loading={isLoading} />
      <StatCard label="Sections" value={data?.counts.sections ?? 0} icon={Layers} loading={isLoading} />
      <StatCard label="Students" value={data?.counts.students ?? 0} icon={GraduationCap} loading={isLoading} />
      <StatCard label="Parents" value={data?.counts.parents ?? 0} icon={Users} loading={isLoading} />
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, loading,
}: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold">{loading ? "—" : value}</p>
    </div>
  );
}
