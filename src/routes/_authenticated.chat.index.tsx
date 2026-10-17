import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
        <MessageSquare className="h-8 w-8" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">Your messages</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Select a conversation from the left or start a new one to begin chatting.
      </p>
    </div>
  );
}
