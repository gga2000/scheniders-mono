/**
 * A stand-in for the browser Supabase client that records every query it is
 * asked to build, so a test can assert which filters a read or write carried.
 *
 * Each `from(table)` / `rpc(name, args)` starts one `RecordedQuery`; every
 * chained builder call (`eq`, `in`, `or`, `select`, `order`, ...) is appended to
 * its `ops`. Awaiting the chain resolves through `respond`, which a test sets to
 * shape the result (rows, a count, or an error).
 *
 * Use it from a `vi.mock("@/lib/supabase", ...)` factory:
 *
 *   vi.mock("@/lib/supabase", async () =>
 *       (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());
 */

export type RecordedOp = { op: string; args: unknown[] };

export type RecordedQuery = {
    kind: "from" | "rpc";
    /** Table, view or function name. */
    target: string;
    /** RPC arguments, for `kind: "rpc"`. */
    rpcArgs?: Record<string, unknown>;
    ops: RecordedOp[];
};

export type QueryResult = { data: unknown; error: unknown; count?: number | null; status?: number };

export const recorded: RecordedQuery[] = [];

/** A result, or a promise of one — so a test can hold a query open and observe what runs meanwhile. */
type Responder = (query: RecordedQuery) => QueryResult | Promise<QueryResult>;

let responder: Responder = () => ({ data: [], error: null, count: 0 });

/** Decide what each awaited query resolves to. */
export function respond(fn: Responder): void {
    responder = fn;
}

export function resetRecording(): void {
    recorded.length = 0;
    responder = () => ({ data: [], error: null, count: 0 });
}

/** True when the query was built with `.eq(column, value)`. */
export function hasEq(query: RecordedQuery, column: string, value: unknown): boolean {
    return query.ops.some((o) => o.op === "eq" && o.args[0] === column && o.args[1] === value);
}

/** True when the query asked only for a count (`select(..., { head: true })`). */
export function isHeadCount(query: RecordedQuery): boolean {
    return query.ops.some((o) => {
        if (o.op !== "select") return false;
        const opts = o.args[1] as { head?: boolean } | undefined;
        return opts?.head === true;
    });
}

/** The queries made against `target` (a table, view or RPC name). */
export function queriesOn(target: string): RecordedQuery[] {
    return recorded.filter((q) => q.target === target);
}

const CHAIN_OPS = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "is", "in", "or", "not", "gte", "lte", "gt", "lt", "like", "ilike",
    "order", "range", "limit", "single", "maybeSingle", "abortSignal",
];

function chainFor(query: RecordedQuery): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    for (const op of CHAIN_OPS) {
        chain[op] = (...args: unknown[]) => {
            query.ops.push({ op, args });
            return chain;
        };
    }
    chain.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve().then(() => responder(query)).then(resolve, reject);
    return chain;
}

export const recordingSupabase = {
    from(target: string) {
        const query: RecordedQuery = { kind: "from", target, ops: [] };
        recorded.push(query);
        return chainFor(query);
    },
    rpc(target: string, rpcArgs?: Record<string, unknown>) {
        const query: RecordedQuery = { kind: "rpc", target, rpcArgs, ops: [] };
        recorded.push(query);
        return chainFor(query);
    },
};

/** The module shape `@/lib/supabase` exports, with the recording client. */
export function recordingSupabaseModule() {
    return { supabase: recordingSupabase };
}
