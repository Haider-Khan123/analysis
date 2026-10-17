// File storage on local disk (replaces Supabase Storage buckets).
// Files live under STORAGE_DIR/<bucket>/<path>; metadata in `storage_objects`.
// Downloads use short-lived HMAC-signed URLs served by src/routes/api.storage.$.ts.
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { sql } from "./pool.server";

export const BUCKETS = ["homework-attachments", "announcement-attachments", "chat-attachments"] as const;
export type Bucket = (typeof BUCKETS)[number];

export function isBucket(b: string): b is Bucket {
  return (BUCKETS as readonly string[]).includes(b);
}

function root(): string {
  return path.resolve(process.env.STORAGE_DIR ?? "storage");
}

/** Resolves a bucket path on disk, rejecting anything that escapes the bucket folder. */
function resolvePath(bucket: Bucket, name: string): string {
  const base = path.join(root(), bucket);
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep) || name.includes("\0")) throw new Error("Invalid object path");
  return full;
}

function sign(bucket: string, name: string, exp: number): string {
  const secret = process.env.AUTH_JWT_SECRET ?? "";
  return createHmac("sha256", secret).update(`${bucket}/${name}:${exp}`).digest("base64url");
}

export function verifySignature(bucket: string, name: string, exp: number, token: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const a = Buffer.from(sign(bucket, name, exp));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function putObject(bucket: Bucket, name: string, data: Buffer, owner: string, mimeType: string | null) {
  const full = resolvePath(bucket, name);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data, { flag: "wx" });
  await sql(
    "INSERT INTO storage_objects (bucket_id, name, owner, mime_type, size) VALUES ($1, $2, $3, $4, $5)",
    [bucket, name, owner, mimeType, data.length],
  );
}

export async function getObject(bucket: Bucket, name: string) {
  const rows = await sql<{ owner: string | null; mime_type: string | null }>(
    "SELECT owner, mime_type FROM storage_objects WHERE bucket_id = $1 AND name = $2",
    [bucket, name],
  );
  if (!rows[0]) return null;
  return { body: await readFile(resolvePath(bucket, name)), mimeType: (rows[0].mime_type as string | null) ?? "application/octet-stream" };
}

export async function getOwner(bucket: Bucket, name: string): Promise<string | null | undefined> {
  const rows = await sql<{ owner: string | null }>(
    "SELECT owner FROM storage_objects WHERE bucket_id = $1 AND name = $2",
    [bucket, name],
  );
  return rows[0] ? (rows[0].owner as string | null) : undefined;
}

export async function removeObject(bucket: Bucket, name: string) {
  await rm(resolvePath(bucket, name), { force: true });
  await sql("DELETE FROM storage_objects WHERE bucket_id = $1 AND name = $2", [bucket, name]);
}

/** Supabase-compatible `storage.from(bucket)` for server code. */
export function storageFrom(bucket: Bucket) {
  return {
    async createSignedUrl(name: string, expiresIn: number) {
      const exp = Math.floor(Date.now() / 1000) + expiresIn;
      const encoded = name.split("/").map(encodeURIComponent).join("/");
      const signedUrl = `/api/storage/${bucket}/${encoded}?exp=${exp}&token=${sign(bucket, name, exp)}`;
      return { data: { signedUrl }, error: null };
    },
  };
}
