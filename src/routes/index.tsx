import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  ShieldCheck,
  Users,
  CalendarCheck,
  MessageSquare,
  ClipboardList,
  LineChart,
  Megaphone,
  Building2,
  Clock,
  HeartHandshake,
  Sparkles,
  UserPlus,
  Bell,
  Eye,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Analysis — Modern School Management Platform for K-12" },
      {
        name: "description",
        content:
          "Analysis is a secure, all-in-one school management platform for admins, teachers, and parents. Manage attendance, homework, progress, and communication — beautifully.",
      },
      { property: "og:title", content: "Analysis — Modern School Management Platform" },
      {
        property: "og:description",
        content:
          "Replace WhatsApp groups, paper diaries, and spreadsheets with one secure, enterprise-grade platform built for schools.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    void context;
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-card/95 shadow-[0_1px_3px_rgba(15,23,42,0.04)] backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground font-bold shadow-[var(--shadow-elegant)]">
              A
            </div>
            <span className="text-lg font-semibold tracking-tight">Analysis</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              How it works
            </a>
          </nav>

          <nav className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="sm" className="rounded-xl shadow-sm">
                Get started
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 -z-10"
            style={{
              background:
                "linear-gradient(180deg, #F8FAFC 0%, #EFF6FF 100%)",
            }}
          />
          <div className="absolute -top-24 right-0 -z-10 h-[420px] w-[420px] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-20 -z-10 h-[360px] w-[360px] rounded-full bg-success/10 blur-3xl" />

          <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              {/* Left */}
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Trusted by modern schools
                </span>
                <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  One platform to run your{" "}
                  <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                    entire school
                  </span>{" "}
                  with confidence.
                </h1>
                <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">
                  Analysis brings admins, teachers, and parents together, replacing fragmented
                  WhatsApp groups, paper diaries, and spreadsheets with a secure, enterprise-grade
                  experience.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/signup">
                    <Button size="lg" className="gap-2 rounded-xl shadow-[var(--shadow-elegant)]">
                      Start your school <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button size="lg" variant="outline" className="rounded-xl">
                      Sign in
                    </Button>
                  </Link>
                </div>

                {/* Trust stats */}
                <div className="mt-10 grid grid-cols-3 gap-3 sm:gap-4">
                  {[
                    { v: "24/7", l: "Customer Support" },
                    { v: "99.9%", l: "Uptime SLA" },
                    { v: "Money-back", l: "Guarantee", small: true },
                  ].map((s) => (
                    <div
                      key={s.l}
                      className="flex items-center justify-center gap-1.5 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-[var(--shadow-card)] backdrop-blur"
                    >
                      <span className={`font-bold text-foreground ${s.small ? "text-base sm:text-lg" : "text-xl sm:text-2xl"}`}>{s.v}</span>
                      <span className="text-xs text-muted-foreground">{s.l}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — Dashboard mockup */}
              <div className="relative">
                <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/20 via-primary-glow/10 to-success/20 blur-2xl" />
                <DashboardMockup />
              </div>
            </div>
          </div>
        </section>

        {/* TRUST & CREDIBILITY */}
        <section className="mx-auto max-w-7xl px-6 py-20">
          <SectionHeader
            eyebrow="Why Analysis"
            title="For schools that care about every detail"
            subtitle="A foundation engineered for security, scale, and the everyday people who run schools."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: ShieldCheck,
                title: "Enterprise security",
                desc: "JWT auth, RBAC, and row-level security baked into every layer.",
                color: "text-primary bg-primary/10",
              },
              {
                icon: HeartHandshake,
                title: "Loved by parents",
                desc: "A calm, ad-free experience that respects family time.",
                color: "text-success bg-success/10",
              },
              {
                icon: Clock,
                title: "Save hours weekly",
                desc: "Automations replace repetitive admin and reporting work.",
                color: "text-warning bg-warning/10",
              },
              {
                icon: Building2,
                title: "Multi-tenant ready",
                desc: "Run one campus or an entire network from one platform.",
                color: "text-primary bg-primary/10",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border/70 bg-card p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${f.color}`}
                >
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CORE FEATURES */}
        <section id="features" className="bg-secondary/40 py-24">
          <div className="mx-auto max-w-7xl px-6">
            <SectionHeader
              eyebrow="Platform"
              title="Everything that your school needs"
              subtitle="Six core modules designed to work together — no plugins, no integrations to maintain."
            />

            <div className="mt-16 space-y-20">
              {CORE_FEATURES.map((f, i) => (
                <FeatureRow key={f.title} feature={f} reverse={i % 2 === 1} />
              ))}
            </div>
          </div>
        </section>

        {/* DASHBOARD SHOWCASE */}
        <section className="relative overflow-hidden py-24">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-primary/5 to-background" />
          <div className="mx-auto max-w-7xl px-6">
            <SectionHeader
              eyebrow="Product tour"
              title="Workspace that the team would want to open"
              subtitle="Floating widgets, fast navigation, and clear hierarchy keep daily operations effortless."
            />
            <div className="relative mt-14">
              <div className="absolute -left-6 -top-6 hidden h-24 w-24 rounded-2xl bg-gradient-to-br from-warning/30 to-warning/0 blur-xl md:block" />
              <div className="absolute -bottom-6 -right-6 hidden h-32 w-32 rounded-2xl bg-gradient-to-br from-success/30 to-success/0 blur-xl md:block" />
              <div className="rounded-[2rem] border border-border/60 bg-card p-3 shadow-[var(--shadow-elegant)] md:p-5">
                <BigDashboardMockup />
              </div>
            </div>
          </div>
        </section>

        {/* BENEFITS */}
        <section className="mx-auto max-w-7xl px-6 py-24">
          <SectionHeader
            eyebrow="Outcomes"
            title="Real benefits that your school will get"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Clock,
                title: "Reduced admin work",
                desc: "Automate attendance reports, notifications, and class admin tasks.",
                tint: "from-primary/15 to-primary/0",
              },
              {
                icon: HeartHandshake,
                title: "Improved parent engagement",
                desc: "Parents stay in the loop with daily progress and clear updates.",
                tint: "from-success/20 to-success/0",
              },
              {
                icon: MessageSquare,
                title: "Centralized communication",
                desc: "One inbox for announcements, chat, and homework — no more chaos.",
                tint: "from-warning/20 to-warning/0",
              },
            ].map((b) => (
              <div
                key={b.title}
                className={`relative overflow-hidden rounded-2xl border border-border/70 bg-card p-8 shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]`}
              >
                <div
                  className={`absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${b.tint}`}
                />
                <div className="relative">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <b.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="bg-secondary/40 py-24">
          <div className="mx-auto max-w-7xl px-6">
            <SectionHeader
              eyebrow="How it works"
              title="Up and running in four simple steps"
            />
            <div className="relative mt-16">
              {/* connector line */}
              <div className="absolute left-0 right-0 top-7 hidden h-0.5 bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0 lg:block" />
              <div className="grid gap-8 lg:grid-cols-4">
                {[
                  { icon: Settings2, title: "School setup", desc: "Create your school, branding, and class structure." },
                  { icon: UserPlus, title: "Registration", desc: "Invite teachers and onboard parents in minutes." },
                  { icon: Bell, title: "Daily updates", desc: "Teachers post attendance, homework, and progress." },
                  { icon: Eye, title: "Parent monitoring", desc: "Parents follow their child's journey in real time." },
                ].map((s, i) => (
                  <div key={s.title} className="relative text-center">
                    <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-card shadow-[var(--shadow-elegant)] ring-1 ring-primary/20">
                      <s.icon className="h-6 w-6 text-primary" />
                      <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow">
                        {i + 1}
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>


        {/* SUCCESS METRICS */}
        <section className="relative overflow-hidden py-24">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-background to-success/5" />
          <div className="mx-auto max-w-7xl px-6">
            <SectionHeader eyebrow="Measured impact" title="Results that move the needle" />
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { v: "95%", l: "Attendance digitization", c: "text-primary" },
                { v: "70%", l: "Paper reduction", c: "text-success" },
                { v: "60%", l: "Parent engagement increase", c: "text-warning" },
                { v: "50%", l: "Administrative time savings", c: "text-primary" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-2xl border border-border/70 bg-card p-8 text-center shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]"
                >
                  <div className={`text-4xl font-bold ${s.c} md:text-5xl`}>{s.v}</div>
                  <div className="mt-3 text-sm font-medium text-muted-foreground">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* CTA */}
        <section className="mx-auto max-w-7xl px-6 pb-24">
          <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary to-primary-glow p-10 text-center text-primary-foreground shadow-[var(--shadow-elegant)] md:p-16">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <h2 className="relative text-3xl font-bold md:text-4xl">
              Ready to run your school the modern way?
            </h2>
            <p className="relative mx-auto mt-4 max-w-2xl text-base opacity-90 md:text-lg">
              Join schools already using Analysis to save time, engage parents, and elevate
              everyday operations.
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/signup">
                <Button size="lg" variant="secondary" className="gap-2 rounded-xl">
                  Start your school <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-xl border-white/40 bg-white/10 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
                >
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer style={{ backgroundColor: "#1E293B" }} className="text-slate-300">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-10 md:grid-cols-3">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow font-bold text-primary-foreground">
                  A
                </div>
                <span className="text-lg font-semibold text-white">Analysis</span>
              </div>
            </div>
            <FooterCol
              title="Product"
              items={[
                { label: "Features", href: "#features" },
                { label: "How it works", href: "#how-it-works" },
              ]}
            />
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
                Account
              </h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <Link to="/login" className="text-slate-400 transition-colors hover:text-white">
                    Log in
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className="text-slate-400 transition-colors hover:text-white">
                    Sign up
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-center gap-4 border-t border-white/10 pt-8 text-sm text-slate-400">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Back to top"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span>© 2026 Analysis. All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* -------- Helpers -------- */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
        {eyebrow}
      </span>
      <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      {subtitle ? <p className="mt-4 text-base text-muted-foreground md:text-lg">{subtitle}</p> : null}
    </div>
  );
}

type Feature = {
  icon: typeof BookOpen;
  title: string;
  desc: string;
  bullets: string[];
  accent: string;
};

const CORE_FEATURES: Feature[] = [
  {
    icon: Building2,
    title: "School Administration",
    desc: "Manage classes, sections, staff, and student records with airtight access control.",
    bullets: ["Multi-tenant ready", "Role-based access", "Detailed academic records"],
    accent: "bg-primary/10 text-primary",
  },
  {
    icon: CalendarCheck,
    title: "Attendance Management",
    desc: "Mark attendance in seconds and surface trends with smart reporting.",
    bullets: ["One-tap marking", "Auto reports", "Parent notifications"],
    accent: "bg-success/10 text-success",
  },
  {
    icon: ClipboardList,
    title: "Homework Management",
    desc: "Assign, track, and review homework with attachments and due dates.",
    bullets: ["File attachments", "Due-date tracking", "Class-wide visibility"],
    accent: "bg-warning/10 text-warning",
  },
  {
    icon: MessageSquare,
    title: "Parent–Teacher Communication",
    desc: "Secure 1:1 chat that respects boundaries — no more late-night WhatsApp pings.",
    bullets: ["Read receipts", "Attachments", "School-only channels"],
    accent: "bg-primary/10 text-primary",
  },
  {
    icon: LineChart,
    title: "Progress Tracking",
    desc: "Capture academic, behavioral, and participation progress in one place.",
    bullets: ["Multi-dimensional", "Visual trends", "Term-by-term history"],
    accent: "bg-success/10 text-success",
  },
  {
    icon: Megaphone,
    title: "Announcements",
    desc: "Broadcast updates with confidence — targeted, scheduled, and tracked.",
    bullets: ["Audience targeting", "Read tracking", "Categories"],
    accent: "bg-warning/10 text-warning",
  },
];

function FeatureRow({ feature, reverse }: { feature: Feature; reverse: boolean }) {
  return (
    <div
      className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
        reverse ? "lg:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div>
        <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${feature.accent}`}>
          <feature.icon className="h-6 w-6" />
        </div>
        <h3 className="mt-5 text-2xl font-bold md:text-3xl">{feature.title}</h3>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground md:text-lg">
          {feature.desc}
        </p>
        <ul className="mt-6 space-y-3">
          {feature.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
              <span className="text-foreground">{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <FeatureVisual icon={feature.icon} accent={feature.accent} title={feature.title} />
      </div>
    </div>
  );
}

function FeatureVisual({
  icon: Icon,
  accent,
  title,
}: {
  icon: typeof BookOpen;
  accent: string;
  title: string;
}) {
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/10 via-transparent to-success/10 blur-2xl" />
      <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-elegant)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-xs text-muted-foreground">Live preview</div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 p-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5" />
                <div>
                  <div className="h-2.5 w-24 rounded bg-foreground/15" />
                  <div className="mt-1.5 h-2 w-16 rounded bg-foreground/10" />
                </div>
              </div>
              <div
                className={`h-6 w-16 rounded-full ${
                  i % 2 === 0 ? "bg-success/15" : "bg-primary/15"
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="relative rounded-[1.75rem] border border-border/70 bg-card p-4 shadow-[var(--shadow-elegant)]">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        </div>
        <div className="rounded-md bg-secondary px-3 py-1 text-xs text-muted-foreground">
          analysis.app/dashboard
        </div>
        <div className="w-12" />
      </div>
      <div className="grid grid-cols-12 gap-4 p-4">
        {/* sidebar */}
        <div className="col-span-3 space-y-2">
          {["Dashboard", "Attendance", "Homework", "Chat", "Reports"].map((l, i) => (
            <div
              key={l}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                i === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-current opacity-60" />
              {l}
            </div>
          ))}
        </div>
        {/* main */}
        <div className="col-span-9 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { v: "96%", l: "Present today", c: "text-success" },
              { v: "24", l: "Homework due", c: "text-warning" },
              { v: "8", l: "New messages", c: "text-primary" },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-xl border border-border/60 bg-background/60 p-3"
              >
                <div className={`text-lg font-bold ${s.c}`}>{s.v}</div>
                <div className="text-[10px] text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="h-3 w-24 rounded bg-foreground/15" />
              <div className="h-2.5 w-16 rounded bg-foreground/10" />
            </div>
            <div className="flex items-end gap-2">
              {[40, 70, 55, 85, 60, 92, 75].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-md bg-gradient-to-t from-primary to-primary-glow"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* floating card */}
      <div className="absolute -bottom-6 -left-6 hidden rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-elegant)] sm:block">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/15 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold">Attendance saved</div>
            <div className="text-[10px] text-muted-foreground">Class 5-A · 38 students</div>
          </div>
        </div>
      </div>
      <div className="absolute -right-4 -top-4 hidden rounded-2xl border border-border/70 bg-card p-3 shadow-[var(--shadow-elegant)] sm:block">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">12 parents online</span>
        </div>
      </div>
    </div>
  );
}

function BigDashboardMockup() {
  return (
    <div className="grid gap-4 rounded-[1.5rem] bg-gradient-to-br from-primary/5 via-secondary/60 to-success/5 p-4 md:grid-cols-3 md:p-6">
      {[
        {
          icon: CalendarCheck,
          title: "Attendance",
          v: "96%",
          sub: "Today · 1,248 students",
          color: "text-success bg-success/10",
        },
        {
          icon: MessageSquare,
          title: "Communication",
          v: "342",
          sub: "Messages this week",
          color: "text-primary bg-primary/10",
        },
        {
          icon: ClipboardList,
          title: "Homework",
          v: "28",
          sub: "Active assignments",
          color: "text-warning bg-warning/10",
        },
        {
          icon: GraduationCap,
          title: "Student tracking",
          v: "A+",
          sub: "Avg. progress this term",
          color: "text-primary bg-primary/10",
        },
        {
          icon: Megaphone,
          title: "Announcements",
          v: "6",
          sub: "Scheduled this week",
          color: "text-warning bg-warning/10",
        },
        {
          icon: Users,
          title: "Engaged parents",
          v: "92%",
          sub: "Weekly active",
          color: "text-success bg-success/10",
        },
      ].map((c) => (
        <div
          key={c.title}
          className="rounded-2xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]"
        >
          <div className="flex items-center justify-between">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Live</span>
          </div>
          <div className="mt-4 text-3xl font-bold">{c.v}</div>
          <div className="mt-1 text-sm font-medium">{c.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

const FAQS = [
  {
    q: "Is Analysis suitable for small schools?",
    a: "Absolutely. Analysis scales from a single classroom to multi-campus networks with the same pricing fairness.",
  },
  {
    q: "How secure is parent and student data?",
    a: "We use JWT-based authentication, role-based access, and row-level security to ensure data is only ever seen by the right people.",
  },
  {
    q: "Can teachers and parents use it on mobile?",
    a: "Yes — Analysis is a fully installable Progressive Web App that works beautifully on any device.",
  },
  {
    q: "Does it replace our existing WhatsApp groups?",
    a: "That's exactly the point. Centralized announcements, 1:1 chat, and homework keep communication structured and respectful.",
  },
  {
    q: "How long does onboarding take?",
    a: "Most schools are live within a day. Our setup flow walks you through creating classes, inviting staff, and onboarding parents.",
  },
];

function FooterCol({
  title,
  items,
}: {
  title: string;
  items: { label: string; href: string }[];
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold uppercase tracking-wider text-white">{title}</h4>
      <ul className="mt-4 space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.label}>
            <a href={i.href} className="text-slate-400 transition-colors hover:text-white">
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Suppress unused import warning
void redirect;
