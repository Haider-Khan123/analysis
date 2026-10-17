# ClassFlow — Setup Guide (PostgreSQL edition)

ClassFlow runs as a single Node.js app (TanStack Start + Vite) that talks directly
to a PostgreSQL database (e.g. Neon, Supabase, or a local Postgres).

## 1. Requirements

| Tool | Version |
| --- | --- |
| Node.js | 20 or newer (tested on 22) |
| npm | 10 or newer |
| PostgreSQL | 15 or newer (tested on Neon, Postgres 18) |

## 2. Create a database

Any Postgres 15+ database works. Two common options:

- **Neon (hosted):** create a project at https://neon.tech and copy the connection string.
- **Local:** install Postgres, then `createdb classflow`.

## 3. Load the schema

From the project folder, on an **empty** database:
```bash
psql "postgresql://user:pass@host/db?sslmode=verify-full" -f postgres/schema.sql
```

This creates all 30 tables, the enum types and the `updated_at` triggers. Run it only once.

## 4. Configure the app

Copy the example config and fill it in:
```bash
cp .env.example .env
```

| Variable | What to put |
| --- | --- |
| `DATABASE_URL` | Postgres connection string, e.g. `postgresql://user:pass@host/db?sslmode=verify-full` (use `sslmode=disable` for a local server without TLS) |
| `PG_POOL_SIZE` | Optional, max pooled connections (default 10) |
| `AUTH_JWT_SECRET` | A random secret, 32+ characters. Generate with `openssl rand -hex 32` |
| `PUBLIC_APP_URL` | Base URL of the app, e.g. `http://localhost:8080` |
| `STORAGE_DIR` | Folder for uploaded files (default `storage`) |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Optional. Creates a super-admin account on the first login attempt |

Instead of `DATABASE_URL` you can set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

Never commit `.env` — it holds your secrets (it is already in `.gitignore`).

## 5. Install and run

```bash
npm install --legacy-peer-deps
npm run dev
```

Open http://localhost:8080.

## 6. First use

1. Click **Get started** and create an account — you become the institute admin.
2. Fill in **School Profile** (name, branch code, phone, logo).
3. Add classes and sections, then teachers, students and parents.
4. To get the platform super-admin, set `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in `.env`
   and log in with them.

## How things work

| Feature | Implementation |
| --- | --- |
| Database | PostgreSQL — schema in `postgres/schema.sql` |
| Data access | Supabase-style `db.from(...)` query builder in `src/integrations/postgres/` |
| Access rules | Checked in server functions (`src/lib/*.functions.ts`); no row-level security |
| Login | Local email/password (bcrypt + signed tokens), table `auth_users` |
| File uploads | Local `storage/` folder, route `src/routes/api.storage.$.ts` |
| Live updates | Pages refresh every 5 seconds |
| Emails | **Not sent** — invite and password-reset links are printed in the server log |

### Invites and password resets
No email service is configured. When an admin invites a teacher/parent or someone
requests a password reset, look in the terminal running `npm run dev` for a line like:

```
[auth] Invite link for teacher@school.com: http://localhost:8080/reset-password#type=invite&recovery_token=...
```

Send that link to the person. Links expire after 24 hours.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm error enoent Could not read package.json` | You are not in the project folder — `cd` into it first |
| `Missing Postgres configuration` | `.env` is missing `DATABASE_URL` — see step 4 |
| `AUTH_JWT_SECRET must be set` | Add a 32+ character secret to `.env` |
| `password authentication failed` | Credentials in `DATABASE_URL` are wrong |
| `relation "..." does not exist` | The schema hasn't been loaded — see step 3 |
| `type "app_role" already exists` when loading schema | The schema was already loaded; skip step 3 |
| `invalid input syntax for type uuid` | An id in the request isn't a valid UUID (bad link or stale URL) |
| npm `ERESOLVE` dependency errors | Use `npm install --legacy-peer-deps` |

## Deploying

The app needs a Node.js server (the `pg` driver doesn't run on Cloudflare Workers, the
Lovable default build target). Deploy to any Node host (VPS, Render, Railway, etc.),
set the same environment variables there, and make sure the `storage/` folder is on
persistent disk.
