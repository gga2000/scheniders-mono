import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * The batched bulk status path: one UPDATE per batch, batches sequential and
 * in id order, rows missing from the response reported (conflict vs. rejected),
 * and a batch whose statement errors retried one order at a time.
 */

type Call = {
    patch: Record<string, unknown>;
    filters: { op: string; args: unknown[] }[];
};

const calls: Call[] = [];
/** Decides what each UPDATE returns. Receives the ids the statement targeted. */
let respond: (ids: string[], call: Call) => { data: unknown; error: unknown };

function idsOf(call: Call): string[] {
    const inFilter = call.filters.find((f) => f.op === "in");
    if (inFilter) return inFilter.args[1] as string[];
    const eq = call.filters.find((f) => f.op === "eq" && f.args[0] === "id");
    return eq ? [eq.args[1] as string] : [];
}

vi.mock("@/lib/supabase", () => {
    const builder = (call: Call) => {
        const settle = () => {
            const ids = idsOf(call);
            const res = respond(ids, call);
            const single = call.filters.some((f) => f.op === "maybeSingle");
            if (single && Array.isArray(res.data)) return { data: res.data[0] ?? null, error: res.error };
            return res;
        };
        const chain: Record<string, unknown> = {};
        for (const op of ["in", "eq", "or", "select", "abortSignal", "maybeSingle"]) {
            chain[op] = (...args: unknown[]) => {
                call.filters.push({ op, args });
                return chain;
            };
        }
        chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve().then(settle).then(resolve, reject);
        return chain;
    };
    return {
        supabase: {
            from: () => ({
                update: (patch: Record<string, unknown>) => {
                    const call: Call = { patch, filters: [] };
                    calls.push(call);
                    return builder(call);
                },
                select: (...args: unknown[]) => {
                    const call: Call = { patch: {}, filters: [{ op: "select", args }] };
                    return builder(call);
                },
            }),
        },
    };
});

import { orderRepository, buildVersionedIdFilter } from "./order-repository";

const row = (id: string, status = "confirmed") => ({ id, status, version: 2, items: [] });

beforeEach(() => {
    calls.length = 0;
    respond = (ids) => ({ data: ids.map((id) => row(id)), error: null });
});

describe("buildVersionedIdFilter", () => {
    it("pins versioned ids and leaves the rest plain", () => {
        expect(buildVersionedIdFilter(["a", "b"], { a: 3 })).toBe("and(id.eq.a,version.eq.3),id.eq.b");
    });
});

describe("orderRepository.bulkUpdateStatus", () => {
    it("writes one statement per batch of 5, sequentially, ids ascending", async () => {
        const ids = Array.from({ length: 12 }, (_, i) => `id-${String(11 - i).padStart(2, "0")}`);
        const { successfulOperations, failedOperations } = await orderRepository.bulkUpdateStatus(ids, "confirmed");
        expect(failedOperations).toEqual([]);
        expect(successfulOperations).toHaveLength(12);
        expect(calls.map(idsOf)).toEqual([
            ["id-00", "id-01", "id-02", "id-03", "id-04"],
            ["id-05", "id-06", "id-07", "id-08", "id-09"],
            ["id-10", "id-11"],
        ]);
        expect(calls[0].patch).toMatchObject({ status: "confirmed", rejection_reason: null, reason_id: null });
    });

    it("reports a row the version guard filtered out as a conflict, and an unversioned one as rejected", async () => {
        respond = (ids) => ({ data: ids.filter((id) => id === "a").map((id) => row(id)), error: null });
        const { successfulOperations, failedOperations } = await orderRepository.bulkUpdateStatus(
            ["a", "b", "c"],
            "confirmed",
            undefined,
            "Ali",
            undefined,
            { a: 1, b: 1 },
        );
        expect(successfulOperations.map((op) => op.id)).toEqual(["a"]);
        expect(failedOperations.map((f) => [f.id, (f.error as Error).message])).toEqual([
            ["b", "CONFLICT_DETECTED"],
            ["c", "Status update failed: row not found or write was rejected. Try refreshing."],
        ]);
        const or = calls[0].filters.find((f) => f.op === "or");
        expect(or?.args[0]).toBe("and(id.eq.a,version.eq.1),and(id.eq.b,version.eq.1),id.eq.c");
    });

    it("retries an erroring batch one order at a time, isolating the bad row", async () => {
        respond = (ids) => {
            if (ids.length > 1) return { data: null, error: { code: "23514", message: "created_at in future" } };
            if (ids[0] === "b") return { data: null, error: { code: "23514", message: "created_at in future" } };
            return { data: [row(ids[0])], error: null };
        };
        const { successfulOperations, failedOperations } = await orderRepository.bulkUpdateStatus(["c", "b", "a"], "confirmed");
        expect(successfulOperations.map((op) => op.id)).toEqual(["a", "c"]);
        expect(failedOperations.map((f) => f.id)).toEqual(["b"]);
        // 1 batch statement, then a, b (retried once by updateStatus), c.
        expect(calls.map(idsOf)).toEqual([["a", "b", "c"], ["a"], ["b"], ["b"], ["c"]]);
    }, 10_000);

    it("hands each batch to onBatchSettled and reports progress", async () => {
        const settled: string[][] = [];
        const progress: number[] = [];
        await orderRepository.bulkUpdateStatus(
            ["a", "b", "c", "d", "e", "f"],
            "in_transit",
            undefined,
            undefined,
            undefined,
            undefined,
            {
                onBatchSettled: (o) => { settled.push(o.succeeded.map((s) => s.id)); },
                onProgress: (p) => progress.push(p.done),
            },
        );
        expect(settled).toEqual([["a", "b", "c", "d", "e"], ["f"]]);
        expect(progress).toEqual([0, 5, 6]);
    });
});
