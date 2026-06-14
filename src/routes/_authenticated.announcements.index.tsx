import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/announcements/")({
  beforeLoad: () => { throw redirect({ to: "/announcements/history" }); },
});
