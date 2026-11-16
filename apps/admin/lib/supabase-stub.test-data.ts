/*
 * A stand-in for the Supabase client in route tests. It behaves like the API
 * where that matters for these routes: a read answers with at most 1,000 rows
 * and says nothing when it cut the list, eq() and in() filter, and a function
 * call goes to the handler registered for it.
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
    const note = (method: string, ...args: unknown[]) => {
      state.calls.push({ on: `${table}.${method}`, args });
      return builder;
    };
    const builder = {
      select: (...args: unknown[]) => note("select", ...args),
      or: (filter: string) => {
        if (!apiCanParse(filter)) parseError = `failed to parse logic tree ((${filter}))`;
        return note("or", filter);
      },
      gte: (...args: unknown[]) => note("gte", ...args),
      lte: (...args: unknown[]) => note("lte", ...args),
      lt: (...args: unknown[]) => note("lt", ...args),
      order: (...args: unknown[]) => note("order", ...args),
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
        return resolve({ data: rows.slice(window[0], last + 1), error: null, count: rows.length });
      },
    };
    function one(exactlyOne: boolean): Answer {
      note(exactlyOne ? "single" : "maybeSingle");
      if (state.failing.has(table)) return { data: null, error: { message: "connection lost" } };
      if (rows.length > 1 || (exactlyOne && rows.length === 0)) {
        return { data: null, error: { code: "PGRST116", message: `JSON object requested, ${rows.length} rows returned` } };
      }
      return { data: rows[0] ?? null, error: null };
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

function matches(field: unknown, operator: string, value: unknown): boolean {
  if (operator === "eq") return field === value;
  if (operator === "neq") return field !== value;
  if (operator === "is") return String(field) === String(value);
  // PostgREST writes a list as "(a,b)".
  if (operator === "in" && typeof value === "string") return value.slice(1, -1).split(",").includes(String(field));
  if (typeof field !== "number" || typeof value !== "number") return false;
  if (operator === "lt") return field < value;
  if (operator === "lte") return field <= value;
  if (operator === "gt") return field > value;
  if (operator === "gte") return field >= value;
  throw new Error(`the stub has no "${operator}" filter`);
}

/**
 * Whether the API can read an "or" filter. Every part must be a plain column
 * name, an operator and a value, or and(...) of such parts: the live API
 * answers a cast like "display_id::text.ilike.1%" with a parse error.
 */
function apiCanParse(filter: string): boolean {
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
  if (inQuotes || depth !== 0) return false;
  return parts.every((one) => {
    const group = /^(?:and|or)\((.*)\)$/.exec(one);
    if (group) return apiCanParse(group[1] ?? "");
    return /^[a-z_][a-z0-9_]*\.(?:not\.)?(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in)\..+$/.test(one);
  });
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
