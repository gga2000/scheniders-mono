import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

/**
 * An in-memory PostgREST stand-in for the MCP tool tests. Filters (`eq`, `is`,
 * `in`) apply to reads and to `update`, so a test that forgets a tenant filter
 * touches rows of another store and fails. `update` bumps `version` the way the
 * `increment_orders_version` trigger does.
 */
export function fakeDb(tables: Record<string, Row[]>, rpc: Record<string, (args: Row) => Row[]> = {}) {
    const calls: { table: string; op: "select" | "update" | "insert"; filters: string[]; payload?: unknown }[] = [];

    function from(table: string) {
        const filters: { desc: string; test: (r: Row) => boolean }[] = [];
        let op: "select" | "update" | "insert" = "select";
        let payload: Row | Row[] | undefined;
        let cap = Infinity;
        let single: "maybe" | "one" | null = null;

        const run = () => {
            calls.push({ table, op, filters: filters.map((f) => f.desc), payload });
            const rows = tables[table] ?? (tables[table] = []);
            if (op === "insert") {
                const list = Array.isArray(payload) ? payload : [payload as Row];
                rows.push(...list);
                return { data: list, error: null };
            }
            const matched = rows.filter((r) => filters.every((f) => f.test(r)));
            if (op === "update") {
                for (const r of matched) Object.assign(r, payload, { version: Number(r.version ?? 0) + 1 });
            }
            const out = matched.slice(0, cap);
            if (single === "maybe") return { data: out[0] ?? null, error: null };
            if (single === "one") return out[0] ? { data: out[0], error: null } : { data: null, error: { message: "no rows" } };
            return { data: out, error: null, count: matched.length };
        };

        const chain = {
            select: () => chain,
            order: () => chain,
            range: () => chain,
            or: () => chain,
            eq(col: string, val: unknown) {
                filters.push({ desc: `${col}=${String(val)}`, test: (r) => r[col] === val });
                return chain;
            },
            is(col: string, val: null) {
                filters.push({ desc: `${col} is null`, test: (r) => (r[col] ?? null) === val });
                return chain;
            },
            in(col: string, vals: unknown[]) {
                filters.push({ desc: `${col} in`, test: (r) => vals.includes(r[col]) });
                return chain;
            },
            gte: () => chain,
            lt: () => chain,
            like: () => chain,
            limit(n: number) {
                cap = n;
                return chain;
            },
            update(patch: Row) {
                op = "update";
                payload = patch;
                return chain;
            },
            insert(rows: Row | Row[]) {
                op = "insert";
                payload = rows;
                return chain;
            },
            maybeSingle() {
                single = "maybe";
                return Promise.resolve(run());
            },
            single() {
                single = "one";
                return Promise.resolve(run());
            },
            then<T>(resolve: (v: ReturnType<typeof run>) => T) {
                return Promise.resolve(run()).then(resolve);
            },
        };
        return chain;
    }

    const db = {
        from,
        rpc: (name: string, args: Row) => Promise.resolve({ data: rpc[name]?.(args) ?? [], error: null }),
    } as unknown as SupabaseClient;

    return { db, calls, tables };
}
