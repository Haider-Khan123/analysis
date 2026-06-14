import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { listEligibleRecipients, getOrCreateConversation } from "@/lib/chat.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/chat/new")({
  component: NewChat,
});

function NewChat() {
  const fetchRecipients = useServerFn(listEligibleRecipients);
  const goc = useServerFn(getOrCreateConversation);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["chat-recipients"],
    queryFn: () => fetchRecipients(),
  });

  const startMut = useMutation({
    mutationFn: async (r: { userId: string; role: "teacher" | "parent"; studentId?: string }) => {
      const res = await goc({
        data: r.role === "parent"
          ? { parentUserId: r.userId, studentId: r.studentId ?? null }
          : { teacherUserId: r.userId, studentId: r.studentId ?? null },
      });
      return res.id;
    },
    onSuccess: (id) => navigate({ to: "/chat/$conversationId", params: { conversationId: id } }),
  });

  const recipients = (data?.recipients ?? []).filter((r) =>
    !q.trim() ? true : r.fullName.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => navigate({ to: "/chat" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-base font-semibold">Start a new conversation</h2>
      </div>
      <div className="p-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recipients.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            <MessageSquare className="mx-auto mb-2 h-6 w-6" />
            No eligible recipients found.
          </div>
        ) : (
          <ul className="space-y-2">
            {recipients.map((r) => {
              const studentChoice = selectedStudent[r.userId] ?? (r.students?.[0]?.id ?? "");
              return (
                <li key={r.userId} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {r.fullName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.fullName}</p>
                    <p className="text-xs capitalize text-muted-foreground">{r.role}</p>
                  </div>
                  {r.students && r.students.length > 0 && (
                    <select
                      value={studentChoice}
                      onChange={(e) => setSelectedStudent((p) => ({ ...p, [r.userId]: e.target.value }))}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {r.students.map((s) => (
                        <option key={s.id} value={s.id}>Re: {s.full_name}</option>
                      ))}
                    </select>
                  )}
                  <Button
                    size="sm"
                    onClick={() => startMut.mutate({ userId: r.userId, role: r.role, studentId: studentChoice || undefined })}
                    disabled={startMut.isPending}
                  >
                    Message
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {startMut.isError && (
          <p className="mt-3 text-xs text-destructive">{(startMut.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}
