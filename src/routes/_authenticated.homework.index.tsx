import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/homework/")({
  beforeLoad: () => { throw redirect({ to: "/homework/list" }); },
});
