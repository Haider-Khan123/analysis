import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCheck, Bell } from "lucide-react";
import { listMyNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/notifications.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const fetchList = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchList(),
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel("notif-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-notifications"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  const readMutation = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });
  const readAllMutation = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });

  const items = data?.notifications ?? [];
  const unread = items.filter((n) => !n.is_read).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" /> Notifications
          {unread > 0 && <Badge variant="destructive">{unread} unread</Badge>}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => readAllMutation.mutate()} disabled={!unread}>
          <CheckCheck className="h-4 w-4" /><span className="ml-1.5">Mark all read</span>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="py-6 text-sm text-muted-foreground">Loading…</p> :
          items.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No notifications yet.</p> :
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id} className={`flex items-start justify-between gap-4 py-3 ${!n.is_read ? "bg-primary/5 -mx-6 px-6" : ""}`}>
                <div>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                {!n.is_read && (
                  <Button size="sm" variant="ghost" onClick={() => readMutation.mutate(n.id)}>Mark read</Button>
                )}
              </li>
            ))}
          </ul>
        }
      </CardContent>
    </Card>
  );
}
