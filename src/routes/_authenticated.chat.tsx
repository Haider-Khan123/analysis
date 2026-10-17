import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { listConversations } from "@/lib/chat.functions";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatLayout,
});

function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ChatLayout() {
  const fetchConvs = useServerFn(listConversations);
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
  const [q, setQ] = useState("");

  const { data, refetch } = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: () => fetchConvs(),
    refetchOnWindowFocus: true,
  });

  // realtime: any insert/update to conversations or messages → refresh list
  useEffect(() => {
    if (!user?.id) return;
    // Poll for changes (replaces Supabase realtime).
    const timer = setInterval(() => { void refetch(); }, 5000);
    return () => clearInterval(timer);
  }, [user?.id, refetch]);

  const conversations = (data?.conversations ?? []).filter((c) =>
    !q.trim() ? true : c.otherName.toLowerCase().includes(q.toLowerCase())
      || (c.lastMessagePreview ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  const activeConvId = location.pathname.startsWith("/chat/") ? location.pathname.split("/")[2] : null;
  const showListOnMobile = !activeConvId || activeConvId === "new";

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-border bg-card">
      <aside className={cn(
        "flex w-full flex-col border-r border-border md:w-80",
        showListOnMobile ? "flex" : "hidden md:flex",
      )}>
        <div className="flex items-center justify-between border-b border-border p-3">
          <h2 className="text-base font-semibold">Messages</h2>
          <div className="flex items-center gap-2">
            <Link to="/chat/new">
              <Button size="sm" variant="default"><Plus className="h-4 w-4" />New</Button>
            </Link>
            <Button size="icon" variant="ghost" onClick={() => navigate({ to: "/dashboard" })} aria-label="Close chat">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search conversations…"
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No conversations yet.
            </div>
          ) : conversations.map((c) => {
            const active = activeConvId === c.id;
            return (
              <Link
                key={c.id}
                to="/chat/$conversationId"
                params={{ conversationId: c.id }}
                className={cn(
                  "flex items-start gap-3 border-b border-border/50 px-3 py-3 transition-colors",
                  active ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {c.otherName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{c.otherName}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {c.lastMessagePreview ?? <span className="italic">No messages yet</span>}
                    </p>
                    {c.unreadCount > 0 && (
                      <Badge variant="default" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
                        {c.unreadCount}
                      </Badge>
                    )}
                  </div>
                  {c.student && (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      Re: {c.student.fullName}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </aside>

      <section className={cn(
        "flex-1 flex-col",
        showListOnMobile ? "hidden md:flex" : "flex",
      )}>
        <Outlet />
      </section>
    </div>
  );
}
