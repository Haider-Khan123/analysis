import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Paperclip, Send, Check, CheckCheck, X, Download, FileText, Image as ImageIcon } from "lucide-react";
import { listMessages, sendMessage, markConversationRead } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  component: ChatThread,
});

const ALLOWED_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
];
const MAX_BYTES = 10 * 1024 * 1024;

type Pending = { file: File; path?: string; uploading?: boolean; error?: string };

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChatThread() {
  const { conversationId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchMessages = useServerFn(listMessages);
  const send = useServerFn(sendMessage);
  const markRead = useServerFn(markConversationRead);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["chat-messages", conversationId],
    queryFn: () => fetchMessages({ data: { conversationId } }),
  });

  const messages = data?.messages ?? [];
  const conv = data?.conversation;
  const meUserId = data?.meUserId ?? user?.id;

  // realtime — refresh on new messages or read events in this conversation
  useEffect(() => {
    const ch = supabase.channel("chat-thread-" + conversationId)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reads" },
        () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, refetch]);

  // mark read when thread opens and when new messages arrive
  useEffect(() => {
    if (!conversationId) return;
    markRead({ data: { conversationId } })
      .then(() => qc.invalidateQueries({ queryKey: ["chat-conversations"] }))
      .catch(() => {});
  }, [conversationId, messages.length, markRead, qc]);

  // scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, data?.conversation?.id]);

  const sendMut = useMutation({
    mutationFn: async () => {
      const attachments = files.filter((f) => f.path).map((f) => ({
        filePath: f.path as string,
        fileName: f.file.name,
        mimeType: f.file.type,
        size: f.file.size,
      }));
      await send({ data: { conversationId, body: body.trim() || null, attachments } });
    },
    onSuccess: () => {
      setBody("");
      setFiles([]);
      refetch();
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
  });

  async function onPickFiles(list: FileList | null) {
    if (!list) return;
    const valid: Pending[] = [];
    for (const f of Array.from(list)) {
      if (!ALLOWED_MIMES.includes(f.type)) {
        valid.push({ file: f, error: "Unsupported type" });
        continue;
      }
      if (f.size > MAX_BYTES) {
        valid.push({ file: f, error: "File too large (10MB max)" });
        continue;
      }
      valid.push({ file: f, uploading: true });
    }
    setFiles((p) => [...p, ...valid].slice(0, 10));
    for (const pending of valid) {
      if (pending.error) continue;
      const safeName = pending.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${conversationId}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, pending.file, {
        contentType: pending.file.type || undefined,
      });
      setFiles((p) => p.map((x) => x.file === pending.file
        ? { ...x, uploading: false, path: error ? undefined : path, error: error?.message }
        : x));
    }
  }

  async function removeFile(f: Pending) {
    if (f.path) await supabase.storage.from("chat-attachments").remove([f.path]);
    setFiles((p) => p.filter((x) => x.file !== f.file));
  }

  const canSend = (!!body.trim() || files.some((f) => f.path)) && !files.some((f) => f.uploading) && !sendMut.isPending;
  const otherName = conv ? (meUserId === conv.teacher?.user_id ? conv.parent?.full_name : conv.teacher?.full_name) : "";

  // group messages by day
  const groups: { day: string; items: typeof messages }[] = [];
  messages.forEach((m) => {
    const day = formatDay(m.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => navigate({ to: "/chat" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {(otherName ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{otherName ?? "Conversation"}</p>
          {conv?.student && <p className="truncate text-xs text-muted-foreground">Re: {conv.student.full_name}</p>}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-muted/20 p-4">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No messages yet. Say hello 👋</p>
        ) : groups.map((g) => (
          <div key={g.day} className="space-y-2">
            <div className="my-2 flex items-center justify-center">
              <span className="rounded-full bg-background px-3 py-1 text-[10px] font-medium text-muted-foreground shadow-sm">
                {g.day}
              </span>
            </div>
            {g.items.map((m) => {
              const mine = m.sender_user_id === meUserId;
              const otherRead = m.reads.some((r) => r.user_id !== m.sender_user_id);
              const readAt = m.reads.find((r) => r.user_id !== m.sender_user_id)?.read_at;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-card border border-border",
                  )}>
                    {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
                    {m.attachments.length > 0 && (
                      <div className={cn("space-y-1.5", m.body ? "mt-2" : "")}>
                        {m.attachments.map((a) => {
                          const isImg = a.mime_type.startsWith("image/");
                          if (isImg && a.url) {
                            return (
                              <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
                                <img src={a.url} alt={a.file_name} className="max-h-60 rounded-lg object-cover" />
                              </a>
                            );
                          }
                          return (
                            <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer"
                              className={cn(
                                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                                mine ? "bg-primary-foreground/10" : "bg-muted",
                              )}>
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="flex-1 truncate">{a.file_name}</span>
                              <Download className="h-3.5 w-3.5 shrink-0" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                    <div className={cn(
                      "mt-1 flex items-center justify-end gap-1 text-[10px]",
                      mine ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}>
                      <span>{formatTime(m.created_at)}</span>
                      {mine && (
                        <span title={otherRead && readAt ? `Read ${formatTime(readAt)}` : "Delivered"}>
                          {otherRead ? <CheckCheck className="h-3 w-3 text-sky-300" /> : <CheckCheck className="h-3 w-3" />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-background p-3">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f) => (
              <div key={f.file.name + f.file.size} className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
                f.error ? "border-destructive text-destructive" : "border-border",
              )}>
                {f.file.type.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                <span className="max-w-[120px] truncate">{f.file.name}</span>
                {f.uploading && <span className="text-muted-foreground">uploading…</span>}
                {f.error && <span>{f.error}</span>}
                <button type="button" onClick={() => removeFile(f)}><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept={ALLOWED_MIMES.join(",")}
              className="hidden"
              onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }}
            />
            <span className="grid h-9 w-9 place-items-center rounded-md border border-input hover:bg-accent">
              <Paperclip className="h-4 w-4" />
            </span>
          </label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) sendMut.mutate();
              }
            }}
            placeholder="Type a message…"
            rows={1}
            className="max-h-32 min-h-[36px] flex-1 resize-none"
          />
          <Button disabled={!canSend} onClick={() => sendMut.mutate()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {sendMut.isError && (
          <p className="mt-2 text-xs text-destructive">{(sendMut.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}
