// PostgreSQL connection pool (server only).
//
// Values are normalised on the way out so the app keeps receiving what it got
// from Supabase:
//   timestamptz -> ISO string "2026-06-01T19:59:30.123+00:00" (always UTC)
//   date        -> "YYYY-MM-DD"
//   numeric     -> number
//   bigint      -> number (COUNT(*), BIGINT columns)
//   jsonb       -> parsed value (pg default)
//   boolean     -> true / false (pg default)
import pg from "pg";
import process from "node:process";

let _pool: pg.Pool | undefined;

function readConfig(): pg.PoolConfig {
  const url = process.env.DATABASE_URL;
  if (url) return { connectionString: url };
  const host = process.env.PGHOST;
  const database = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  if (!host || !database || !user) {
    throw new Error(
      "Missing Postgres configuration. Set DATABASE_URL, or PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE.",
    );
  }
  return {
    host,
    port: Number(process.env.PGPORT ?? 5432),
    user,
    password: process.env.PGPASSWORD ?? "",
    database,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true },
  };
}

const OID = { int8: 20, date: 1082, timestamp: 1114, timestamptz: 1184, numeric: 1700 } as const;

/** "2026-06-01 19:59:30.123+05" -> "2026-06-01T14:59:30.123+00:00", independent of session TimeZone. */
function toIsoUtc(v: string): string {
  if (v === "infinity" || v === "-infinity") return v;
  let s = v.replace(" ", "T");
  if (/[+-]\d\d$/.test(s)) s += ":00";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? v : d.toISOString().replace("Z", "+00:00");
}

const types: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: "text" | "binary") => {
    switch (oid) {
      case OID.timestamptz:
        return toIsoUtc;
      case OID.timestamp:
        return (v: string) => toIsoUtc(`${v}+00`);
      case OID.date:
        return (v: string) => v;
      case OID.numeric:
      case OID.int8:
        return (v: string) => Number(v);
      default:
        return pg.types.getTypeParser(oid, format);
    }
  }) as pg.CustomTypesConfig["getTypeParser"],
};

export function getPool(): pg.Pool {
  if (_pool) return _pool;
  _pool = new pg.Pool({
    ...readConfig(),
    max: Number(process.env.PG_POOL_SIZE ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    types,
  });
  // An idle client losing its connection (e.g. Neon scaling to zero) must not crash the server.
  _pool.on("error", (e) => console.error("[db] idle client error:", e.message));
  return _pool;
}

/** Runs one parameterised statement ($1, $2, ...) and returns its rows. */
export async function sql<R = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<R[]> {
  const res = await getPool().query(text, params);
  return res.rows as R[];
}

export type ColumnInfo = { dataType: string; udtName: string };
let _columns: Promise<Map<string, Map<string, ColumnInfo>>> | undefined;

/** Column metadata for every table, used to convert values written to date/json columns. */
export function getColumns(): Promise<Map<string, Map<string, ColumnInfo>>> {
  if (_columns) return _columns;
  _columns = (async () => {
    const rows = await sql<{ t: string; c: string; d: string; u: string }>(
      `SELECT table_name AS t, column_name AS c, data_type AS d, udt_name AS u
         FROM information_schema.columns WHERE table_schema = current_schema()`,
    );
    const map = new Map<string, Map<string, ColumnInfo>>();
    for (const r of rows) {
      if (!map.has(r.t)) map.set(r.t, new Map());
      map.get(r.t)!.set(r.c, { dataType: r.d.toLowerCase(), udtName: r.u.toLowerCase() });
    }
    return map;
  })().catch((e) => {
    _columns = undefined;
    throw e;
  });
  return _columns;
}
