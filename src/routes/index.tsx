import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BookOpen, ShieldCheck, Users, GraduationCap, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Analysis — School Management Platform" },
      {
        name: "description",
        content:
          "A modern school management SaaS for admins, teachers, and parents. Replace WhatsApp, paper diaries, and spreadsheets.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    // If already signed in via SSR-safe check we can't read here; client-side handled via redirects below
    void context;
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              A
            </div>
            <span className="text-lg font-semibold tracking-tight">Analysis</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background" />
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Phase 1 · Auth + Student Administration
              </span>
              <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground md:text-6xl">
                One system to run your school.
              </h1>
              <p className="mt-6 text-lg text-muted-foreground md:text-xl">
                Analysis replaces fragmented WhatsApp groups, paper diaries, and Excel sheets with a
                secure, centralized platform for admins, teachers, and parents.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/signup">
                  <Button size="lg" className="gap-2">
                    Start your school <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline">Sign in</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: GraduationCap,
                title: "Student Administration",
                desc: "Enroll students, manage classes, sections, and complete academic records.",
              },
              {
                icon: Users,
                title: "Roles for everyone",
                desc: "Dedicated dashboards for school admins, teachers, and parents.",
              },
              {
                icon: ShieldCheck,
                title: "Secure by default",
                desc: "JWT auth, row-level security, and role-based access — built in.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-accent p-8 md:p-12">
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              <div>
                <h2 className="text-2xl font-bold md:text-3xl">Production-ready foundation.</h2>
                <p className="mt-3 text-muted-foreground">
                  Multi-tenant architecture, role-based access control, installable PWA, and a
                  clean REST surface ready to scale into a commercial platform.
                </p>
              </div>
              <ul className="space-y-3">
                {[
                  "JWT-based authentication & RBAC",
                  "School-scoped row-level security",
                  "Admin, Teacher & Parent dashboards",
                  "Installable Progressive Web App",
                ].map((i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span>© {new Date().getFullYear()} Analysis. All rights reserved.</span>
          </div>
          <div className="flex gap-4">
            <Link to="/login">Log in</Link>
            <Link to="/signup">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Suppress unused import warning
void redirect;
