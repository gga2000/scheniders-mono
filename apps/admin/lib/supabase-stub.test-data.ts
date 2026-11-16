/*
 * A stand-in for the Supabase client in route tests. It behaves like the API
 * where that matters for these routes: a read answers with at most 1,000 rows
 * and says nothing when it cut the list, eq() and in() filter, and a function
 * call goes to the handler registered for it.
 */

export type Row = Record<string, unknown>;
type Answer = { data: unknown; error: { message: string } | null };

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
    const note = (method: string, ...args: unknown[]) => {
      state.calls.push({ on: `${table}.${method}`, args });
      return builder;
    };
    const builder = {
      select: (...args: unknown[]) => note("select", ...args),
      or: (...args: unknown[]) => note("or", ...args),
      gte: (...args: unknown[]) => note("gte", ...args),
      lte: (...args: unknown[]) => note("lte", ...args),
      order: (...args: unknown[]) => note("order", ...args),
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return note("eq", column, value);
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return note("in", column, values);
      },
      range: (first: number, last: number) => {
        window = [first, last];
        return note("range", first, last);
      },
      then: (resolve: (answer: Answer & { count: number | null }) => void) => {
        if (state.failing.has(table)) {
          return resolve({ data: null, error: { message: "connection lost" }, count: null });
        }
        const last = Math.min(window[1], window[0] + SERVER_MAX_ROWS - 1);
        return resolve({ data: rows.slice(window[0], last + 1), error: null, count: rows.length });
      },
    };
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
    lock_reason: null,
    lock_since: null,
    ...extra,
  };
}
