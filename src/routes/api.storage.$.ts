import { createFileRoute } from "@tanstack/react-router";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function parse(splat: string | undefined) {
  const parts = (splat ?? "").split("/").map((p) => decodeURIComponent(p));
  const bucket = parts.shift() ?? "";
  return { bucket, name: parts.join("/") };
}

async function requireUser(request: Request): Promise<string | null> {
  const { auth } = await import("@/integrations/postgres/auth.server");
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return (await auth.getClaims(h.slice(7)))?.sub ?? null;
}

/** Chat files are stored under <conversation_id>/...; only participants may upload. */
async function isConversationParticipant(conversationId: string, userId: string) {
  const { sql } = await import("@/integrations/postgres/pool.server");
  // Path segments are user-supplied; a non-UUID folder name simply isn't a conversation.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) return false;
  const rows = await sql(
    `SELECT 1 FROM conversations c
       LEFT JOIN teachers t ON t.id = c.teacher_id
       LEFT JOIN parents p ON p.id = c.parent_id
      WHERE c.id = $1 AND (t.user_id = $2 OR p.user_id = $2) LIMIT 1`,
    [conversationId, userId],
  );
  return rows.length > 0;
}

export const Route = createFileRoute("/api/storage/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const storage = await import("@/integrations/postgres/storage.server");
        const { bucket, name } = parse(params._splat);
        const url = new URL(request.url);
        const exp = Number(url.searchParams.get("exp"));
        const token = url.searchParams.get("token") ?? "";
        if (!storage.isBucket(bucket) || !storage.verifySignature(bucket, name, exp, token)) {
          return new Response("Invalid or expired link", { status: 403 });
        }
        const obj = await storage.getObject(bucket, name);
        if (!obj) return new Response("Not found", { status: 404 });
        return new Response(new Uint8Array(obj.body), {
          headers: { "content-type": obj.mimeType, "cache-control": "private, max-age=300" },
        });
      },

      POST: async ({ request, params }) => {
        const storage = await import("@/integrations/postgres/storage.server");
        const userId = await requireUser(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const { bucket, name } = parse(params._splat);
        if (!storage.isBucket(bucket) || !name) return new Response("Bad request", { status: 400 });
        if (bucket === "chat-attachments" && !(await isConversationParticipant(name.split("/")[0], userId))) {
          return new Response("Forbidden", { status: 403 });
        }
        const body = Buffer.from(await request.arrayBuffer());
        if (body.length > MAX_UPLOAD_BYTES) return new Response("File too large", { status: 413 });
        try {
          await storage.putObject(bucket, name, body, userId, request.headers.get("content-type"));
        } catch (e) {
          const code = (e as { code?: string }).code;
          return new Response(code === "EEXIST" || code === "23505" ? "The resource already exists" : "Upload failed", {
            status: code === "EEXIST" || code === "23505" ? 409 : 500,
          });
        }
        return Response.json({ path: name });
      },

      DELETE: async ({ request, params }) => {
        const storage = await import("@/integrations/postgres/storage.server");
        const userId = await requireUser(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const { bucket, name } = parse(params._splat);
        if (!storage.isBucket(bucket)) return new Response("Bad request", { status: 400 });
        const owner = await storage.getOwner(bucket, name);
        if (owner === undefined) return new Response(null, { status: 204 });
        if (owner !== userId) return new Response("Forbidden", { status: 403 });
        await storage.removeObject(bucket, name);
        return new Response(null, { status: 204 });
      },
    },
  },
});
