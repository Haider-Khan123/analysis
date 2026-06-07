import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/attendance/")({
  beforeLoad: () => { throw redirect({ to: "/attendance/mark" }); },
});
