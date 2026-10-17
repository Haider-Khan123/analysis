// A small query builder over PostgreSQL that mirrors the subset of the Supabase
// (PostgREST) client API this app uses:
//
//   db.from("students").select("id, full_name").eq("school_id", id).order("full_name")
//   db.from("homework").insert(row).select("id").single()
//   db.from("attendance_records").upsert(rows, { onConflict: "student_id,attendance_date" })
//   db.from("announcements").select("*").or("section_id.in.(a,b),and(type.eq.x,class_id.in.(c))")
//
// Results resolve to `{ data, error, count }` just like supabase-js, so calling code
// keeps its existing error handling. All values are bound as parameters; identifiers
// are validated against a strict pattern before being quoted.
import { getColumns, getPool, type ColumnInfo } from "./pool.server";

export type DbError = { message: string; code: string; details: string | null; hint: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbResult<T = any> = { data: T | null; error: DbError | null; count: number | null; status: number };

type Cmp = "=" | "<>" | ">" | ">=" | "<" | "<=" | "LIKE" | "ILIKE";
type Cond =
  | { kind: "cmp"; col: string; op: Cmp; value: unknown }
  | { kind: "in"; col: string; values: unknown[] }
  | { kind: "is"; col: string; value: null | boolean }
  | { kind: "contains"; col: string; value: unknown }
  | { kind: "and" | "or"; items: Cond[] }
  | { kind: "not"; item: Cond };

type Op = "select" | "insert" | "update" | "upsert" | "delete";
type Row = Record<string, unknown>;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class DbQueryError extends Error {}

function ident(name: string): string {
  if (!IDENT.test(name)) throw new DbQueryError(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

/** Appends a bound value and returns its placeholder ($1, $2, ...). */
function bind(params: unknown[], v: unknown): string {
  params.push(v);
  return `$${params.length}`;
}

/** Converts a JS value into what Postgres expects for the given column. */
function toDbValue(col: ColumnInfo | undefined, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  const type = col?.dataType;
  if (type === "date") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string" && v.length > 10 && v[10] === "T") return v.slice(0, 10);
  }
  if (type === "json" || type === "jsonb") return JSON.stringify(v);
  if (typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
}

function mapError(e: unknown): DbError {
  const err = e as { code?: string; message?: string; detail?: string; hint?: string };
  return {
    code: err.code ?? "PG_ERROR",
    message: err.message ?? String(e),
    details: err.detail ?? null,
    hint: err.hint ?? null,
  };
}

// ---------------------------------------------------------------- PostgREST filter strings

/** Splits on commas that are not nested inside parentheses or quotes. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

function unquote(v: string): string {
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

function parseOperator(col: string, op: string, raw: string): Cond {
  switch (op) {
    case "eq": return { kind: "cmp", col, op: "=", value: unquote(raw) };
    case "neq": return { kind: "cmp", col, op: "<>", value: unquote(raw) };
    case "gt": return { kind: "cmp", col, op: ">", value: unquote(raw) };
    case "gte": return { kind: "cmp", col, op: ">=", value: unquote(raw) };
    case "lt": return { kind: "cmp", col, op: "<", value: unquote(raw) };
    case "lte": return { kind: "cmp", col, op: "<=", value: unquote(raw) };
    case "like": return { kind: "cmp", col, op: "LIKE", value: unquote(raw).replace(/\*/g, "%") };
    case "ilike": return { kind: "cmp", col, op: "ILIKE", value: unquote(raw).replace(/\*/g, "%") };
    case "is": {
      const v = raw.toLowerCase();
      return { kind: "is", col, value: v === "null" ? null : v === "true" };
    }
    case "in": {
      const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
      return { kind: "in", col, values: inner === "" ? [] : splitTopLevel(inner).map(unquote) };
    }
    case "cs": return { kind: "contains", col, value: JSON.parse(raw) };
    default:
      throw new DbQueryError(`Unsupported filter operator: ${op}`);
  }
}

function parseLogicTerm(term: string): Cond {
  const group = /^(not\.)?(and|or)\((.*)\)$/s.exec(term);
  if (group) {
    const cond: Cond = { kind: group[2] as "and" | "or", items: splitTopLevel(group[3]).map(parseLogicTerm) };
    return group[1] ? { kind: "not", item: cond } : cond;
  }
  const first = term.indexOf(".");
  if (first < 0) throw new DbQueryError(`Invalid filter: ${term}`);
  const col = term.slice(0, first);
  let rest = term.slice(first + 1);
  let negate = false;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf(".");
  if (dot < 0) throw new DbQueryError(`Invalid filter: ${term}`);
  const cond = parseOperator(col, rest.slice(0, dot), rest.slice(dot + 1));
  return negate ? { kind: "not", item: cond } : cond;
}

// ---------------------------------------------------------------- builder

function parseSelect(cols: string): string {
  const parts = cols.split(",").map((c) => c.trim()).filter(Boolean);
  if (parts.length === 0) return "*";
  return parts
    .map((p) => {
      if (p === "*") return "*";
      if (p.includes("(")) throw new DbQueryError(`Embedded resources are not supported: ${p}`);
      const [aliasOrCol, maybeCol] = p.split(":");
      const col = (maybeCol ?? aliasOrCol).split("::")[0].trim();
      return maybeCol ? `${ident(col)} AS ${ident(aliasOrCol.trim())}` : ident(col);
    })
    .join(", ");
}

export class QueryBuilder<T = AnyRow[]> implements PromiseLike<DbResult<T>> {
  private op: Op = "select";
  private columns = "*";
  private returning: string | null = null;
  private conds: Cond[] = [];
  private orders: Array<{ col: string; ascending: boolean; nullsFirst: boolean }> = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private countMode: "exact" | null = null;
  private head = false;
  private singleMode: "single" | "maybe" | null = null;
  private rows: Row[] = [];
  private values: Row = {};
  private onConflict: string[] | null = null;
  private ignoreDuplicates = false;
  private promise: Promise<DbResult> | null = null;

  constructor(private readonly table: string) {
    ident(table);
  }

  // ---- operations
  select(columns = "*", opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    if (this.op === "select") {
      this.columns = columns;
      if (opts?.count) this.countMode = "exact";
      if (opts?.head) this.head = true;
    } else {
      this.returning = columns;
    }
    return this;
  }
  insert(rows: Row | Row[], _opts?: { defaultToNull?: boolean }): this {
    this.op = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.op = "upsert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts?.onConflict ? opts.onConflict.split(",").map((c) => c.trim()) : null;
    this.ignoreDuplicates = !!opts?.ignoreDuplicates;
    return this;
  }
  update(values: Row): this {
    this.op = "update";
    this.values = values;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }

  // ---- filters
  eq(col: string, value: unknown): this { this.conds.push({ kind: "cmp", col, op: "=", value }); return this; }
  neq(col: string, value: unknown): this { this.conds.push({ kind: "cmp", col, op: "<>", value }); return this; }
  gt(col: string, value: unknown): this { this.conds.push({ kind: "cmp", col, op: ">", value }); return this; }
  gte(col: string, value: unknown): this { this.conds.push({ kind: "cmp", col, op: ">=", value }); return this; }
  lt(col: string, value: unknown): this { this.conds.push({ kind: "cmp", col, op: "<", value }); return this; }
  lte(col: string, value: unknown): this { this.conds.push({ kind: "cmp", col, op: "<=", value }); return this; }
  like(col: string, pattern: string): this { this.conds.push({ kind: "cmp", col, op: "LIKE", value: pattern }); return this; }
  ilike(col: string, pattern: string): this { this.conds.push({ kind: "cmp", col, op: "ILIKE", value: pattern }); return this; }
  in(col: string, values: readonly unknown[]): this { this.conds.push({ kind: "in", col, values: [...values] }); return this; }
  is(col: string, value: null | boolean): this { this.conds.push({ kind: "is", col, value }); return this; }
  contains(col: string, value: unknown): this { this.conds.push({ kind: "contains", col, value }); return this; }
  match(obj: Row): this {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  not(col: string, op: string, value: unknown): this {
    const raw = value === null ? "null" : Array.isArray(value) ? `(${value.join(",")})` : String(value);
    this.conds.push({ kind: "not", item: parseOperator(col, op, raw) });
    return this;
  }
  filter(col: string, op: string, value: unknown): this {
    if (op.startsWith("not.")) return this.not(col, op.slice(4), value);
    this.conds.push(parseOperator(col, op, value === null ? "null" : String(value)));
    return this;
  }
  or(filters: string): this {
    this.conds.push({ kind: "or", items: splitTopLevel(filters).map(parseLogicTerm) });
    return this;
  }

  // ---- modifiers
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    const ascending = opts?.ascending ?? true;
    // Postgres default: NULLS LAST for ASC, NULLS FIRST for DESC.
    this.orders.push({ col, ascending, nullsFirst: opts?.nullsFirst ?? !ascending });
    return this;
  }
  limit(n: number): this { this.limitN = n; return this; }
  range(from: number, to: number): this {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }
  single(): QueryBuilder<AnyRow> { this.singleMode = "single"; return this as unknown as QueryBuilder<AnyRow>; }
  maybeSingle(): QueryBuilder<AnyRow> { this.singleMode = "maybe"; return this as unknown as QueryBuilder<AnyRow>; }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    this.promise ??= this.execute();
    return (this.promise as Promise<DbResult<T>>).then(onfulfilled, onrejected);
  }

  // ---------------------------------------------------------------- compile
  private compileCond(c: Cond, cols: Map<string, ColumnInfo>, params: unknown[]): string {
    switch (c.kind) {
      case "cmp":
        return `${ident(c.col)} ${c.op} ${bind(params, toDbValue(cols.get(c.col), c.value))}`;
      case "in": {
        if (c.values.length === 0) return "FALSE";
        const ph = c.values.map((v) => bind(params, toDbValue(cols.get(c.col), v)));
        return `${ident(c.col)} IN (${ph.join(", ")})`;
      }
      case "is":
        if (c.value === null) return `${ident(c.col)} IS NULL`;
        return `${ident(c.col)} IS ${c.value ? "TRUE" : "FALSE"}`;
      case "contains":
        return `${ident(c.col)} @> ${bind(params, JSON.stringify(c.value))}::jsonb`;
      case "and":
      case "or": {
        if (c.items.length === 0) return c.kind === "and" ? "TRUE" : "FALSE";
        const joiner = c.kind === "and" ? " AND " : " OR ";
        return `(${c.items.map((i) => this.compileCond(i, cols, params)).join(joiner)})`;
      }
      case "not":
        return `NOT (${this.compileCond(c.item, cols, params)})`;
    }
  }

  private where(cols: Map<string, ColumnInfo>, params: unknown[]): string {
    if (this.conds.length === 0) return "";
    return " WHERE " + this.conds.map((c) => this.compileCond(c, cols, params)).join(" AND ");
  }

  private orderLimit(): string {
    let sql = "";
    if (this.orders.length) {
      sql +=
        " ORDER BY " +
        this.orders
          .map((o) => `${ident(o.col)} ${o.ascending ? "ASC" : "DESC"} NULLS ${o.nullsFirst ? "FIRST" : "LAST"}`)
          .join(", ");
    }
    if (this.limitN != null) sql += ` LIMIT ${Math.max(0, Math.floor(this.limitN))}`;
    if (this.offsetN != null) sql += ` OFFSET ${Math.max(0, Math.floor(this.offsetN))}`;
    return sql;
  }

  private returningClause(): string {
    return this.returning != null ? ` RETURNING ${parseSelect(this.returning)}` : "";
  }

  // ---------------------------------------------------------------- execute
  private async execute(): Promise<DbResult> {
    try {
      const allCols = await getColumns();
      const cols = allCols.get(this.table);
      if (!cols) throw new DbQueryError(`Unknown table: ${this.table}`);
      let rows: Row[] | null;
      let count: number | null = null;
      switch (this.op) {
        case "select":
          ({ rows, count } = await this.runSelect(cols));
          break;
        case "insert":
        case "upsert":
          rows = await this.runInsert(cols);
          break;
        case "update":
          rows = await this.runUpdate(cols);
          break;
        case "delete":
          rows = await this.runDelete(cols);
          break;
      }
      return this.shape(rows, count);
    } catch (e) {
      if (e instanceof DbQueryError) {
        return { data: null, error: { message: e.message, code: "PGRST100", details: null, hint: null }, count: null, status: 400 };
      }
      return { data: null, error: mapError(e), count: null, status: 400 };
    }
  }

  private shape(rows: Row[] | null, count: number | null): DbResult {
    if (this.singleMode && rows) {
      if (rows.length === 1) return { data: rows[0], error: null, count, status: 200 };
      if (rows.length === 0 && this.singleMode === "maybe") return { data: null, error: null, count, status: 200 };
      return {
        data: null,
        error: {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: `The result contains ${rows.length} rows`,
          hint: null,
        },
        count,
        status: 406,
      };
    }
    return { data: rows, error: null, count, status: 200 };
  }

  private async runSelect(cols: Map<string, ColumnInfo>): Promise<{ rows: Row[] | null; count: number | null }> {
    const pool = getPool();
    let count: number | null = null;
    if (this.countMode) {
      const params: unknown[] = [];
      const r = await pool.query(`SELECT COUNT(*) AS n FROM ${ident(this.table)}${this.where(cols, params)}`, params);
      count = Number(r.rows[0].n);
    }
    if (this.head) return { rows: null, count };
    const params: unknown[] = [];
    const sql = `SELECT ${parseSelect(this.columns)} FROM ${ident(this.table)}${this.where(cols, params)}${this.orderLimit()}`;
    const r = await pool.query(sql, params);
    return { rows: r.rows as Row[], count };
  }

  private async runInsert(cols: Map<string, ColumnInfo>): Promise<Row[] | null> {
    if (this.rows.length === 0) return this.returning != null ? [] : null;
    const prepared = this.rows.map((row) => {
      const clean: Row = {};
      for (const [k, v] of Object.entries(row)) if (v !== undefined) clean[k] = v;
      return clean;
    });

    // Rows with different key sets are inserted separately so omitted columns get their DB default.
    const groups = new Map<string, Row[]>();
    for (const r of prepared) {
      const key = Object.keys(r).sort().join(",");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    const conflict = this.onConflict ?? ["id"];
    const out: Row[] = [];
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      for (const [key, group] of groups) {
        const keys = key === "" ? [] : key.split(",");
        for (const k of keys) if (!cols.has(k)) throw new DbQueryError(`Unknown column "${k}" on table "${this.table}"`);
        const params: unknown[] = [];
        let sql: string;
        if (keys.length === 0) {
          sql = `INSERT INTO ${ident(this.table)} DEFAULT VALUES`;
        } else {
          const tuples = group.map((r) => `(${keys.map((k) => bind(params, toDbValue(cols.get(k), r[k]))).join(", ")})`);
          sql = `INSERT INTO ${ident(this.table)} (${keys.map(ident).join(", ")}) VALUES ${tuples.join(", ")}`;
        }
        if (this.op === "upsert") {
          sql += ` ON CONFLICT (${conflict.map(ident).join(", ")})`;
          if (this.ignoreDuplicates) {
            sql += " DO NOTHING";
          } else {
            const updatable = keys.filter((k) => !conflict.includes(k) && k !== "id");
            // With nothing to update, a no-op assignment still lets RETURNING yield the existing row.
            const target = updatable.length ? updatable : [conflict[0]];
            sql += ` DO UPDATE SET ${target.map((k) => `${ident(k)} = EXCLUDED.${ident(k)}`).join(", ")}`;
          }
        }
        sql += this.returningClause();
        // DEFAULT VALUES inserts one row per statement.
        const times = keys.length === 0 ? group.length : 1;
        for (let n = 0; n < times; n++) {
          const r = await client.query(sql, params);
          out.push(...(r.rows as Row[]));
        }
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }

    return this.returning == null ? null : out;
  }

  private async runUpdate(cols: Map<string, ColumnInfo>): Promise<Row[] | null> {
    const entries = Object.entries(this.values).filter(([, v]) => v !== undefined);
    for (const [k] of entries) if (!cols.has(k)) throw new DbQueryError(`Unknown column "${k}" on table "${this.table}"`);
    const params: unknown[] = [];
    if (entries.length === 0) {
      if (this.returning == null) return null;
      const r = await getPool().query(
        `SELECT ${parseSelect(this.returning)} FROM ${ident(this.table)}${this.where(cols, params)}`,
        params,
      );
      return r.rows as Row[];
    }
    const set = entries.map(([k, v]) => `${ident(k)} = ${bind(params, toDbValue(cols.get(k), v))}`).join(", ");
    const r = await getPool().query(
      `UPDATE ${ident(this.table)} SET ${set}${this.where(cols, params)}${this.returningClause()}`,
      params,
    );
    return this.returning == null ? null : (r.rows as Row[]);
  }

  private async runDelete(cols: Map<string, ColumnInfo>): Promise<Row[] | null> {
    const params: unknown[] = [];
    const r = await getPool().query(
      `DELETE FROM ${ident(this.table)}${this.where(cols, params)}${this.returningClause()}`,
      params,
    );
    return this.returning == null ? null : (r.rows as Row[]);
  }
}
