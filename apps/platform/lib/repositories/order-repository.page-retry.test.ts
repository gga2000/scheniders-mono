import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    recorded,
    respond,
    resetRecording,
    hasEq,
    isHeadCount,
    type RecordedQuery,
    type QueryResult,
} from "@/lib/__fixtures__/recording-supabase";
import type { TrustRow } from "@/lib/customer-trust-risk";

/*
 * A list read is several parallel page GETs. One page that fails in transit
 * (the client's 10s fetch timeout aborting it, a dropped connection, a 5xx)
 * is re-read on its own; it used to fail the whole read, and React Query's
 * retry then re-read every page, the head and the trust book from scratch.
 */

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());

import { isTransientReadFailure, orderRepository, PAGE_RETRIES } from "./order-repository";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ABORTED = { data: null, error: { message: "AbortError: signal is aborted without reason", code: "" }, status: 0 };

const op = (q: RecordedQuery, name: string) => q.ops.find((o) => o.op === name);
const rangeOf = (q: RecordedQuery) => op(q, "range")?.args as [number, number] | undefined;
const isOrderPage = (q: RecordedQuery) => q.target === "orders" && rangeOf(q) !== undefined;
const isTrustPage = (q: RecordedQuery) => q.target === "customer_trust" && rangeOf(q) !== undefined;

function orderRow(i: number): Record<string, unknown> {
    return {
        id: `o${String(100000 - i).padStart(6, "0")}`,
        tenant_id: TENANT,
        order_id: `LF-${i}`,
        phone: `0770${String(1000000 + i).padStart(7, "0")}`,
        status: "new",
        items: [],
        created_at: new Date(Date.parse("2026-10-18T10:00:00.000Z") - i * 60_000).toISOString(),
        is_pinned: false,
    };
}

const ROWS = Array.from({ length: 2500 }, (_, i) => orderRow(i));
const TRUST = Array.from({ length: 1500 }, (_, i) => ({ tenant_id: TENANT, phone: `770${1000000 + i}`, trust_score: 50 }) as unknown as TrustRow);

/** PostgREST over ROWS / TRUST (filters ignored, ranges honoured). `fail` may answer a query instead. */
function serve(q: RecordedQuery, fail: (q: RecordedQuery) => QueryResult | null): QueryResult {
    const failed = fail(q);
    if (failed) return failed;
    const book = q.target === "customer_trust" ? TRUST : ROWS;
    if (isHeadCount(q)) return { data: null, error: null, count: book.length, status: 200 };
    if (q.target === "orders" && hasEq(q, "is_pinned", true)) return { data: [], error: null, status: 200 };
    const range = rangeOf(q);
    if (range) return { data: book.slice(range[0], range[1] + 1), error: null, status: 200 };
    const limit = op(q, "limit")?.args[0] as number | undefined;
    return { data: book.slice(0, limit ?? book.length), error: null, count: book.length, status: 200 };
}

/** Fail the first `times` reads of the page starting at `from` with `result`. */
function failPage(match: (q: RecordedQuery) => boolean, from: number, times: number, result: QueryResult) {
    let left = times;
    return (q: RecordedQuery) => {
        if (match(q) && rangeOf(q)?.[0] === from && left > 0) {
            left--;
            return result;
        }
        return null;
    };
}

const NARROW = {
    fromInstant: Date.parse("2026-10-17T21:00:00.000Z"),
    toInstant: Date.parse("2026-10-18T20:59:59.999Z"),
    fromDay: "2026-10-18",
    toDay: "2026-10-18",
};

beforeEach(() => resetRecording());

describe("isTransientReadFailure", () => {
    it("re-sends only reads that got no response or a gateway failure", () => {
        expect(isTransientReadFailure(ABORTED)).toBe(true);
        expect(isTransientReadFailure({ error: { message: "x" }, status: 503 })).toBe(true);
        expect(isTransientReadFailure({ error: { message: "x" }, status: 400 })).toBe(false);
        expect(isTransientReadFailure({ error: { message: "x" }, status: 401 })).toBe(false);
        expect(isTransientReadFailure({ error: null, status: 0 })).toBe(false);
        // No status: not a PostgREST response we can judge.
        expect(isTransientReadFailure({ error: { message: "x" } })).toBe(false);
    });
});

describe("a list page that fails in transit is re-read on its own", () => {
    it("wide read (All Orders): re-reads that page once, and nothing else", async () => {
        const fail = failPage(isOrderPage, 1000, 1, ABORTED);
        respond((q) => serve(q, fail));
        const rows = await orderRepository.findAll(TENANT, { onPreview: () => {} });

        expect(rows).toHaveLength(ROWS.length);
        expect(rows.map((r) => r.id)).toEqual(ROWS.map((r) => r.id));
        const pages = recorded.filter(isOrderPage).map((q) => rangeOf(q)?.[0]);
        expect(pages.sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 1000, 1000, 2000]);
        // The head and the trust book were read once: no whole-read restart.
        expect(recorded.filter((q) => q.target === "orders" && !isOrderPage(q))).toHaveLength(2);
        expect(recorded.filter((q) => q.target === "customer_trust" && isHeadCount(q))).toHaveLength(1);
    });

    it("narrow read (Today): the same", async () => {
        const fail = failPage(isOrderPage, 2000, 1, { data: null, error: { message: "Bad gateway" }, status: 502 });
        respond((q) => serve(q, fail));
        const rows = await orderRepository.findWindow(TENANT, NARROW);

        expect(rows).toHaveLength(ROWS.length);
        expect(recorded.filter(isOrderPage)).toHaveLength(4);
        expect(recorded.filter((q) => q.target === "orders" && isHeadCount(q))).toHaveLength(1);
    });

    it("trust book page: the same", async () => {
        const fail = failPage(isTrustPage, 1000, 1, ABORTED);
        respond((q) => serve(q, fail));
        const rows = await orderRepository.findAll(TENANT);

        expect(rows).toHaveLength(ROWS.length);
        expect(recorded.filter(isTrustPage).map((q) => rangeOf(q)?.[0]).sort()).toEqual([0, 1000, 1000]);
    });

    it("a 4xx fails the read at once: it is the request's fault, not the network's", async () => {
        const refused = { data: null, error: { message: "column does not exist", code: "42703" }, status: 400 };
        const fail = failPage(isOrderPage, 1000, 1, refused);
        respond((q) => serve(q, fail));

        await expect(orderRepository.findWindow(TENANT, NARROW)).rejects.toMatchObject({ code: "42703" });
        expect(recorded.filter((q) => isOrderPage(q) && rangeOf(q)?.[0] === 1000)).toHaveLength(1);
    });

    it("a page that keeps failing fails the read after PAGE_RETRIES re-reads", async () => {
        const fail = failPage(isOrderPage, 0, Infinity, ABORTED);
        respond((q) => serve(q, fail));

        await expect(orderRepository.findAll(TENANT)).rejects.toMatchObject({ message: expect.stringContaining("AbortError") });
        expect(recorded.filter((q) => isOrderPage(q) && rangeOf(q)?.[0] === 0)).toHaveLength(1 + PAGE_RETRIES);
    });
});
