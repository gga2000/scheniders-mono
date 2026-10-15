// =====================================================================
// In-memory PostgREST double for server-side money tests
// =====================================================================
// The checkout and the upsell route decide what a shopper pays, so their
// tests need to exercise the real query chains — including the tenant
// filters — rather than a stub that returns the same rows whatever is
// asked. This double APPLIES `eq` / `in` / `is` / `not is` filters to the
// rows it holds, so a row belonging to another tenant is only invisible if
// the code under test actually scoped its query. `update` mutates the held
// rows (bumping `version` like the orders BEFORE UPDATE trigger does), so
// optimistic-concurrency paths behave as they would against Postgres.
//
// Test-only: nothing in the app imports this file.
// =====================================================================

import type { createSupabaseServiceClient } from "@/lib/supabase/server";

export type Row = Record<string, unknown>;

interface Result {
  data: unknown;
  error: { message: string } | null;
}

export interface RpcCall {
  fn: string;
  args: Row;
}

export interface WriteCall {
  table: string;
  op: "update" | "insert";
  payload: Row;
  matched: number;
}

export interface FakeSupabaseOptions {
  /** Tables whose reads fail, to exercise fail-closed paths. */
  failingTables?: string[];
  /** Return value per RPC name; defaults to `{ data: null, error: null }`. */
  rpc?: Record<string, (args: Row) => Result>;
}

export interface FakeSupabase {
  tables: Record<string, Row[]>;
  rpcCalls: RpcCall[];
  writes: WriteCall[];
  client: ReturnType<typeof createSupabaseServiceClient>;
}

export function createFakeSupabase(
  tables: Record<string, Row[]>,
  options: FakeSupabaseOptions = {},
): FakeSupabase {
  const rpcCalls: RpcCall[] = [];
  const writes: WriteCall[] = [];

  function from(table: string) {
    const predicates: Array<(r: Row) => boolean> = [];
    let op: "select" | "update" | "insert" = "select";
    let payload: Row = {};

    const matching = (): Row[] =>
      (tables[table] ?? []).filter((r) => predicates.every((p) => p(r)));

    const run = (): Result => {
      if (options.failingTables?.includes(table)) {
        return { data: null, error: { message: `${table} unavailable` } };
      }
      if (op === "insert") {
        const list = tables[table] ?? (tables[table] = []);
        list.push({ ...payload });
        writes.push({ table, op, payload, matched: 1 });
        return { data: [payload], error: null };
      }
      const rows = matching();
      if (op === "update") {
        for (const r of rows) {
          Object.assign(r, payload);
          if (typeof r.version === "number") r.version += 1;
        }
        writes.push({ table, op, payload, matched: rows.length });
      }
      return { data: rows.map((r) => ({ ...r })), error: null };
    };

    const chain = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (col: string, value: unknown) => {
        predicates.push((r) => r[col] === value);
        return chain;
      },
      in: (col: string, values: readonly unknown[]) => {
        predicates.push((r) => values.includes(r[col]));
        return chain;
      },
      is: (col: string, value: unknown) => {
        predicates.push((r) => (r[col] ?? null) === value);
        return chain;
      },
      not: (col: string, operator: string, value: unknown) => {
        if (operator !== "is") throw new Error(`fake-supabase: unsupported not.${operator}`);
        predicates.push((r) => (r[col] ?? null) !== value);
        return chain;
      },
      update: (values: Row) => {
        op = "update";
        payload = values;
        return chain;
      },
      insert: (values: Row) => {
        op = "insert";
        payload = values;
        return chain;
      },
      maybeSingle: (): Promise<Result> => {
        const res = run();
        if (res.error) return Promise.resolve(res);
        const rows = res.data as Row[];
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      single: (): Promise<Result> => {
        const res = run();
        if (res.error) return Promise.resolve(res);
        const rows = res.data as Row[];
        return Promise.resolve(
          rows.length === 1
            ? { data: rows[0], error: null }
            : { data: null, error: { message: "expected one row" } },
        );
      },
      then: <T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  }

  function rpc(fn: string, args: Row): Promise<Result> {
    rpcCalls.push({ fn, args });
    const handler = options.rpc?.[fn];
    return Promise.resolve(handler ? handler(args) : { data: null, error: null });
  }

  // The double implements the slice of the client the server code uses; the
  // cast is confined here so no test needs its own.
  const client = { from, rpc } as unknown as ReturnType<typeof createSupabaseServiceClient>;
  return { tables, rpcCalls, writes, client };
}
