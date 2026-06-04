import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, GraduationCap, UserCog, School, Users } from "lucide-react";
import { getDashboardStats } from "@/lib/school.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Analysis" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { profile } = useAuth();
  const fetchStats = useServerFn(getDashboardStats);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Good morning, {profile?.full_name ?? "there"}!
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Institute" value={data?.counts.institute ?? 0} icon={Building2} loading={isLoading} />
        <StatCard label="Classes" value={data?.counts.classes ?? 0} icon={School} loading={isLoading} />
        <StatCard label="Teachers" value={data?.counts.teachers ?? 0} icon={UserCog} loading={isLoading} />
        <StatCard label="Students" value={data?.counts.students ?? 0} icon={GraduationCap} loading={isLoading} />
        <StatCard label="Parents" value={data?.counts.parents ?? 0} icon={Users} loading={isLoading} />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Getting Started</h2>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li><span className="font-medium text-foreground">1.</span> Create your institute from <span className="font-medium text-foreground">School Profile</span>.</li>
          <li><span className="font-medium text-foreground">2.</span> Set up your classes and sections.</li>
          <li><span className="font-medium text-foreground">3.</span> Add teachers and assign them to sections.</li>
          <li><span className="font-medium text-foreground">4.</span> Enroll students into their class & section.</li>
          <li><span className="font-medium text-foreground">5.</span> Add parents and link them to their children.</li>
        </ol>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
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
