import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/** Requires a valid bearer token; exposes `userId` and `claims` to the handler. */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { auth } = await import("./auth.server");
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader) throw new Error("Unauthorized: No authorization header provided");
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized: Only Bearer tokens are supported");

  const claims = await auth.getClaims(authHeader.slice("Bearer ".length));
  if (!claims) throw new Error("Unauthorized: Invalid token");

  return next({ context: { userId: claims.sub, claims } });
});
