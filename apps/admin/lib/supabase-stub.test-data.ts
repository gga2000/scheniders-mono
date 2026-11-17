/*
 * A stand-in for the Supabase client in route tests. It behaves like the API
 * where that matters for these routes: a read answers with at most 1,000 rows
 * and says nothing when it cut the list; eq(), match(), in(), gt(), gte(), lt(),
 * lte() and or() filter (or() also answers the API's parse error for a filter
 * it cannot read); order() sorts before range() cuts; and a function call goes
 * to the handler registered for it. So a wrong date window or a wrong sort
 * fails a test instead of passing unseen.
 */

export type Row = Record<string, unknown>;
type Answer = { data: unknown; error: { code?: string; message: string } | null };

export const SERVER_MAX_ROWS = 1000;

export function supabaseStub() {
  const state = {
    tables: {} as Record<string, Row[]>,
    /** Tables whose reads fail. */
    failing: new Set<string>(),
    functions: {} as Record<string, (args: Row) => Answer>,
    /** Every builder call, as "table.method" with its arguments. */
    calls: [] as Array<{ on: string; args: unknown[] }>,
    rpcCalls: [] as Array<{ fn: string; args: Row }>,
  };

  function from(table: string) {
    let rows = state.tables[table] ?? [];
    let window: [number, number] = [0, SERVER_MAX_ROWS - 1];
    let parseError: string | null = null;
    const sorts: Sort[] = [];
    const note = (method: string, ...args: unknown[]) => {
      state.calls.push({ on: `${table}.${method}`, args });
      return builder;
    };
    const builder = {
      select: (...args: unknown[]) => note("select", ...args),
      or: (filter: string) => {
        const parts = orParts(filter);
        if (parts) rows = rows.filter((row) => parts.some((part) => partHolds(row, part)));
        else parseError = `failed to parse logic tree ((${filter}))`;
        return note("or", filter);
      },
      gt: (column: string, value: unknown) => compareFilter("gt", column, value),
      gte: (column: string, value: unknown) => compareFilter("gte", column, value),
      lt: (column: string, value: unknown) => compareFilter("lt", column, value),
      lte: (column: string, value: unknown) => compareFilter("lte", column, value),
      // The first order() is the main sort, as in the API; ascending puts empty values last.
      order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => {
        const ascending = options?.ascending ?? true;
        sorts.push({ column, ascending, nullsFirst: options?.nullsFirst ?? !ascending });
        return options ? note("order", column, options) : note("order", column);
      },
      // "tenants.is_demo" filters on an embedded row, as an inner join does.
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => fieldOf(row, column) === value);
        return note("eq", column, value);
      },
      // A computed column (a database function over the row) is a plain field of the stub's rows.
      filter: (column: string, operator: string, value: unknown) => {
        rows = rows.filter((row) => matches(row[column], operator, value));
        return note("filter", column, operator, value);
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(fieldOf(row, column)));
        return note("in", column, values);
      },
      // match({ a: 1, "tenants.b": 2 }) is eq() on each column, as in the API.
      match: (query: Record<string, unknown>) => {
        rows = rows.filter((row) => Object.entries(query).every(([column, value]) => fieldOf(row, column) === value));
        return note("match", query);
      },
      neq: (column: string, value: unknown) => {
        rows = rows.filter((row) => fieldOf(row, column) !== value);
        return note("neq", column, value);
      },
      range: (first: number, last: number) => {
        window = [first, last];
        return note("range", first, last);
      },
      limit: (count: number) => {
        window = [window[0], window[0] + count - 1];
        return note("limit", count);
      },
      // One row: single() wants exactly one (PGRST116 otherwise), maybeSingle() one or none.
      single: async (): Promise<Answer> => one(true),
      maybeSingle: async (): Promise<Answer> => one(false),
      then: (resolve: (answer: Answer & { count: number | null }) => void) => {
        if (state.failing.has(table)) {
          return resolve({ data: null, error: { message: "connection lost" }, count: null });
        }
        if (parseError) return resolve({ data: null, error: { message: parseError }, count: null });
        const last = Math.min(window[1], window[0] + SERVER_MAX_ROWS - 1);
        return resolve({ data: sorted().slice(window[0], last + 1), error: null, count: rows.length });
      },
    };
    function compareFilter(operator: "gt" | "gte" | "lt" | "lte", column: string, value: unknown) {
      rows = rows.filter((row) => matches(fieldOf(row, column), operator, value));
      return note(operator, column, value);
    }
    function sorted(): Row[] {
      if (sorts.length === 0) return rows;
      return [...rows].sort((a, b) => {
        for (const sort of sorts) {
          const order = sortOrder(fieldOf(a, sort.column), fieldOf(b, sort.column), sort);
          if (order !== 0) return order;
        }
        return 0;
      });
    }
    function one(exactlyOne: boolean): Answer {
      note(exactlyOne ? "single" : "maybeSingle");
      if (state.failing.has(table)) return { data: null, error: { message: "connection lost" } };
      if (rows.length > 1 || (exactlyOne && rows.length === 0)) {
        return { data: null, error: { code: "PGRST116", message: `JSON object requested, ${rows.length} rows returned` } };
      }
      return { data: sorted()[0] ?? null, error: null };
    }
    return builder;
  }

  async function rpc(fn: string, args: Row): Promise<Answer> {
    state.rpcCalls.push({ fn, args });
    const handler = state.functions[fn];
    return handler ? handler(args) : { data: null, error: { message: `function ${fn} does not exist` } };
  }

  /** The tables that were read, each once. */
  const tablesRead = () => [...new Set(state.calls.map((call) => call.on.split(".")[0]))];
  /** The arguments of every call to "table.method". */
  const callsTo = (on: string) => state.calls.filter((call) => call.on === on).map((call) => call.args);

  return { state, client: { from, rpc }, tablesRead, callsTo };
}

function fieldOf(row: Row, column: string): unknown {
  const [first, ...rest] = column.split(".");
  return rest.reduce<unknown>((value, key) => (value as Row | null | undefined)?.[key], row[first ?? ""]);
}

type Sort = { column: string; ascending: boolean; nullsFirst: boolean };

/** One row before (-1) or after (1) another for one order() call. */
function sortOrder(a: unknown, b: unknown, sort: Sort): number {
  const aEmpty = a === null || a === undefined;
  const bEmpty = b === null || b === undefined;
  if (aEmpty || bEmpty) {
    if (aEmpty && bEmpty) return 0;
    return aEmpty === sort.nullsFirst ? -1 : 1;
  }
  const order = compareValues(a, b);
  return sort.ascending ? order : -order;
}

/**
 * Compare two values as Postgres would for these tests: numbers by size,
 * timestamps by time (so "…Z" and "…+00:00" agree), other text and booleans
 * as they sort. Two kinds that Postgres would not compare throw, so a test
 * with the wrong kind of value fails loudly.
 */
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (typeof a === "string" && typeof b === "string") {
    const time = /^\d{4}-\d{2}-\d{2}/;
    if (time.test(a) && time.test(b)) return Date.parse(a) - Date.parse(b);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  throw new Error(`the stub cannot compare ${JSON.stringify(a)} with ${JSON.stringify(b)}`);
}

function matches(field: unknown, operator: string, value: unknown): boolean {
  if (operator === "eq") return field === value;
  if (operator === "neq") return field !== value;
  if (operator === "is") return String(field) === String(value);
  // PostgREST writes a list as "(a,b)".
  if (operator === "in" && typeof value === "string") return value.slice(1, -1).split(",").includes(String(field));
  if (operator === "not.in" && typeof value === "string") return !value.slice(1, -1).split(",").includes(String(field));
  // Postgres ~*: a case-insensitive pattern.
  if (operator === "imatch" && typeof value === "string") return typeof field === "string" && new RegExp(value, "iu").test(field);
  // A comparison with an empty value is never true in SQL.
  if (field === null || field === undefined) return false;
  if (operator === "lt") return compareValues(field, value) < 0;
  if (operator === "lte") return compareValues(field, value) <= 0;
  if (operator === "gt") return compareValues(field, value) > 0;
  if (operator === "gte") return compareValues(field, value) >= 0;
  throw new Error(`the stub has no "${operator}" filter`);
}

/**
 * The parts of an "or" filter, or null when the API cannot read it. Every part
 * must be a column name (or a JSON field of one, "restrictions->>status_before"),
 * an operator and a value, or and(...) / or(...) of such parts: the live API
 * answers a cast like "display_id::text.ilike.1%" with a parse error.
 */
function orParts(filter: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let inQuotes = false;
  let afterBackslash = false;
  let part = "";
  for (const ch of filter) {
    if (afterBackslash || (inQuotes && ch === "\\")) {
      afterBackslash = !afterBackslash;
      part += ch;
      continue;
    }
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && ch === "(") depth++;
    if (!inQuotes && ch === ")") depth--;
    if (!inQuotes && depth === 0 && ch === ",") {
      parts.push(part);
      part = "";
      continue;
    }
    part += ch;
  }
  parts.push(part);
  if (inQuotes || depth !== 0) return null;
  const readable = parts.every((one) => {
    const group = GROUP.exec(one);
    return group ? orParts(group[2] ?? "") !== null : LEAF.test(one);
  });
  return readable ? parts : null;
}

const GROUP = /^(and|or)\((.*)\)$/;
const LEAF = /^([a-z_][a-z0-9_]*(?:->>?[a-z_][a-z0-9_]*)*)\.(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.+)$/;

/** Whether one part of a readable "or" filter holds for a row, as Postgres reads it. */
function partHolds(row: Row, part: string): boolean {
  const group = GROUP.exec(part);
  if (group) {
    const inner = orParts(group[2] ?? "") ?? [];
    return group[1] === "and" ? inner.every((one) => partHolds(row, one)) : inner.some((one) => partHolds(row, one));
  }
  const [, column = "", not, operator = "", raw = ""] = LEAF.exec(part) ?? [];
  const field = column.split(/->>?/).reduce<unknown>((value, key, i) => (i === 0 ? row[key] : (value as Row | null | undefined)?.[key]), null);
  const value = raw.startsWith('"') ? raw.slice(1, -1).replace(/\\(.)/g, "$1") : raw;
  if (operator === "is") {
    const holds = value === "null" ? field === null || field === undefined : String(field) === value;
    return not ? !holds : holds;
  }
  // Any other comparison with an empty value is neither true nor false in SQL: the row is left out.
  if (field === null || field === undefined) return false;
  const text = String(field);
  let holds: boolean;
  if (operator === "eq") holds = text === value;
  else if (operator === "neq") holds = text !== value;
  else if (operator === "in") holds = value.slice(1, -1).split(",").includes(text);
  else if (operator === "like" || operator === "ilike") holds = likePattern(value, operator === "ilike").test(text);
  else holds = matches(typeof field === "number" ? field : text, operator, typeof field === "number" ? Number(value) : value);
  return not ? !holds : holds;
}

/** A LIKE pattern as a regular expression: % (or the API's *) is any text, _ one character. */
function likePattern(pattern: string, ignoreCase: boolean): RegExp {
  const source = [...pattern]
    .map((ch) => (ch === "%" || ch === "*" ? ".*" : ch === "_" ? "." : ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${source}$`, ignoreCase ? "isu" : "su");
}

/** One row of admin_merchant_list_stats for a shop with nothing. */
export function listStatsRow(tenantId: string, extra: Row = {}): Row {
  return {
    tenant_id: tenantId,
    orders_30d: 0,
    order_sparkline: new Array(30).fill(0),
    last_order_at: null,
    fees_30d: 0,
    fees_today: 0,
    last_wallet_at: null,
    usage_orders_count: null,
    usage_orders_charged: null,
    usage_team_members_count: null,
    team_members: 0,
    lock_reason: null,
    lock_since: null,
    ...extra,
  };
}
