// Local email/password authentication backed by the `auth_users` table.
// Replaces Supabase Auth: bcrypt password hashes + HS256-signed access tokens.
//
// There is no email provider configured. Invite and password-recovery links are
// written to the server log ("[auth] ... link: ...") so an admin can pass them on.
import bcrypt from "bcryptjs";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { sql } from "./pool.server";

export type AuthUser = {
  id: string;
  email: string;
  user_metadata: Record<string, string | number | boolean | null>;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
};
export type AuthSession = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: AuthUser;
};
export type AuthClaims = { sub: string; email: string; sv: number; iat: number; exp: number; role: "authenticated" };
type AuthError = { message: string; status: number };

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const RECOVERY_TTL_MS = 1000 * 60 * 60 * 24;

function secret(): string {
  const s = process.env.AUTH_JWT_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_JWT_SECRET must be set (at least 32 characters).");
  return s;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function signToken(claims: AuthClaims): string {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const sig = createHmac("sha256", secret()).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

function decodeToken(token: string): AuthClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = createHmac("sha256", secret()).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as AuthClaims;
    if (!claims.sub || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

type UserRow = {
  id: string;
  email: string;
  encrypted_password: string | null;
  raw_user_meta_data: Record<string, unknown> | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  session_version: number;
  recovery_sent_at: string | null;
  created_at: string;
};

function toUser(r: UserRow): AuthUser {
  return {
    id: r.id,
    email: r.email,
    user_metadata: (r.raw_user_meta_data ?? {}) as AuthUser["user_metadata"],
    created_at: r.created_at,
    email_confirmed_at: r.email_confirmed_at,
    last_sign_in_at: r.last_sign_in_at,
  };
}

async function findByEmail(email: string): Promise<UserRow | null> {
  const rows = await sql<UserRow>("SELECT * FROM auth_users WHERE lower(email) = $1", [email.trim().toLowerCase()]);
  return rows[0] ?? null;
}

async function findById(id: string): Promise<UserRow | null> {
  const rows = await sql<UserRow>("SELECT * FROM auth_users WHERE id = $1", [id]);
  return rows[0] ?? null;
}

function issueSession(r: UserRow): AuthSession {
  const now = Math.floor(Date.now() / 1000);
  const claims: AuthClaims = { sub: r.id, email: r.email, sv: r.session_version, iat: now, exp: now + TOKEN_TTL_SECONDS, role: "authenticated" };
  return { access_token: signToken(claims), token_type: "bearer", expires_in: TOKEN_TTL_SECONDS, expires_at: claims.exp, user: toUser(r) };
}

/** Mirrors the old `handle_new_user` trigger: every auth user gets a profile row. */
async function ensureProfile(id: string, email: string, meta: Record<string, unknown>) {
  const fullName = typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name : email.split("@")[0];
  await sql("INSERT INTO profiles (id, full_name, email) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [id, fullName, email]);
}

async function insertUser(opts: { email: string; password?: string | null; meta?: Record<string, unknown>; confirmed?: boolean }): Promise<UserRow> {
  const email = opts.email.trim().toLowerCase();
  const id = randomUUID();
  const hash = opts.password ? await bcrypt.hash(opts.password, 10) : null;
  const meta = opts.meta ?? {};
  await sql(
    "INSERT INTO auth_users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at) VALUES ($1, $2, $3, $4, $5)",
    [id, email, hash, JSON.stringify(meta), opts.confirmed === false ? null : new Date().toISOString()],
  );
  await ensureProfile(id, email, meta);
  return (await findById(id))!;
}

function appUrl(redirectTo?: string): string {
  if (redirectTo) return redirectTo;
  return `${process.env.PUBLIC_APP_URL ?? "http://localhost:8080"}/reset-password`;
}

async function issueRecoveryLink(userId: string, email: string, kind: "invite" | "recovery", redirectTo?: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql("UPDATE auth_users SET recovery_token_hash = $1, recovery_sent_at = now() WHERE id = $2", [hash, userId]);
  const link = `${appUrl(redirectTo)}#type=${kind}&recovery_token=${token}`;
  console.info(`[auth] ${kind === "invite" ? "Invite" : "Password recovery"} link for ${email}: ${link}`);
  return link;
}

const err = (message: string, status = 400): AuthError => ({ message, status });

// ---------------------------------------------------------------- public API

export const auth = {
  async signInWithPassword(email: string, password: string) {
    const row = await findByEmail(email);
    if (!row || !row.encrypted_password || !(await bcrypt.compare(password, row.encrypted_password))) {
      return { data: { session: null, user: null }, error: err("Invalid login credentials") };
    }
    await sql("UPDATE auth_users SET last_sign_in_at = now() WHERE id = $1", [row.id]);
    const session = issueSession(row);
    return { data: { session, user: session.user }, error: null };
  },

  async signUp(email: string, password: string, meta: Record<string, unknown>) {
    if (!email || password.length < 6) return { data: { session: null, user: null }, error: err("Password should be at least 6 characters.") };
    if (await findByEmail(email)) return { data: { session: null, user: null }, error: err("User already registered", 422) };
    const row = await insertUser({ email, password, meta });
    const session = issueSession(row);
    return { data: { session, user: session.user }, error: null };
  },

  /** Validates an access token, including revocation via session_version. */
  async getClaims(token: string): Promise<AuthClaims | null> {
    const claims = decodeToken(token);
    if (!claims) return null;
    const row = await findById(claims.sub);
    if (!row || row.session_version !== claims.sv) return null;
    return claims;
  },

  async getUser(userId: string): Promise<AuthUser | null> {
    const row = await findById(userId);
    return row ? toUser(row) : null;
  },

  async updatePassword(userId: string, password: string) {
    if (password.length < 6) return { error: err("Password should be at least 6 characters.") };
    const hash = await bcrypt.hash(password, 10);
    await sql("UPDATE auth_users SET encrypted_password = $1, email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = $2", [hash, userId]);
    return { error: null };
  },

  async exchangeRecoveryToken(token: string) {
    const hash = createHash("sha256").update(token).digest("hex");
    const rows = await sql<UserRow>("SELECT * FROM auth_users WHERE recovery_token_hash = $1", [hash]);
    const row = rows[0];
    if (!row || !row.recovery_sent_at || Date.now() - new Date(String(row.recovery_sent_at)).getTime() > RECOVERY_TTL_MS) {
      return { data: { session: null }, error: err("Email link is invalid or has expired", 403) };
    }
    await sql("UPDATE auth_users SET recovery_token_hash = NULL, email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = $1", [row.id]);
    return { data: { session: issueSession(row) }, error: null };
  },

  async resetPasswordForEmail(email: string, opts?: { redirectTo?: string }) {
    const row = await findByEmail(email);
    // Like Supabase, don't reveal whether the address exists.
    if (row) await issueRecoveryLink(row.id, row.email, "recovery", opts?.redirectTo);
    return { data: {}, error: null };
  },

  admin: {
    async createUser(opts: { email: string; password?: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) {
      if (await findByEmail(opts.email)) {
        return { data: { user: null }, error: err("A user with this email address has already been registered", 422) };
      }
      const row = await insertUser({ email: opts.email, password: opts.password, meta: opts.user_metadata, confirmed: opts.email_confirm !== false });
      return { data: { user: toUser(row) }, error: null };
    },

    async inviteUserByEmail(email: string, opts?: { data?: Record<string, unknown>; redirectTo?: string }) {
      if (await findByEmail(email)) {
        return { data: { user: null }, error: err("A user with this email address has already been registered", 422) };
      }
      const row = await insertUser({ email, password: null, meta: opts?.data, confirmed: false });
      await issueRecoveryLink(row.id, row.email, "invite", opts?.redirectTo);
      return { data: { user: toUser(row) }, error: null };
    },

    async listUsers(opts?: { page?: number; perPage?: number }) {
      const perPage = opts?.perPage ?? 1000;
      const offset = ((opts?.page ?? 1) - 1) * perPage;
      const rows = await sql<UserRow>("SELECT * FROM auth_users ORDER BY created_at LIMIT $1 OFFSET $2", [perPage, offset]);
      return { data: { users: rows.map(toUser) }, error: null };
    },

    /** Revokes every access token issued to this user. */
    async signOut(userId: string) {
      await sql("UPDATE auth_users SET session_version = session_version + 1 WHERE id = $1", [userId]);
      return { error: null };
    },
  },
};
