import { createMiddleware } from "@tanstack/react-start";
import { getAccessToken } from "./client";

// Registered as a global `functionMiddleware` in `src/start.ts` so the browser
// attaches the bearer token to every serverFn RPC.
export const attachAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = getAccessToken();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
