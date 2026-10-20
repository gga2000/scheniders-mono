import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The orders list is hydrated from a sessionStorage SWR cache before the real
 * fetch returns. An EMPTY cached array used to be written and then hydrated, and
 * React Query treats `[]` as loaded data — so `isLoading` went false with no
 * rows and the page rendered its "No orders yet" empty state while the fetch was
 * still running. A merchant with 4,778 orders was told they had none.
 *
 * These pin the cache half of that. Timing is not asserted, deliberately: the
 * symptom is only visible when the refetch is slow, which is not reproducible in
 * a test. What IS reproducible is the rule — an empty cache must never present
 * itself as loaded data.
 */
const CACHE_KEY = "schneiders_orders_swr";
const TS_KEY = "schneiders_orders_swr_ts";
const WINDOW_KEY = "schneiders_orders_swr_window";
type Rows = Parameters<typeof writeSwrCache>[0];

const store = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
});

const H = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: H.report }));

import { perfTrace } from "@/lib/perf-trace";
import { SWR_MAX_CHARS, SWR_MAX_ROWS, readSwrCache, writeSwrCache } from "./use-orders-query";

beforeEach(() => {
    store.clear();
    H.report.mockReset();
    vi.restoreAllMocks();
});

const MARK_KEY = "schneiders_orders_swr_mark";
const rowsOf = (n: number, pad = 0) =>
    Array.from({ length: n }, (_, i) => ({ id: `o${i}`, notes: "x".repeat(pad) })) as unknown as Rows;

describe("orders SWR cache size bound", () => {
    it(`skips a result over ${SWR_MAX_ROWS} rows before serializing it, and keeps the existing snapshot`, () => {
        writeSwrCache(rowsOf(3), "today-key", "2026-10-19T08:00:00.000Z");
        const before = new Map(store);
        const time = vi.spyOn(perfTrace, "time");
        const setItem = vi.spyOn(sessionStorage, "setItem");

        writeSwrCache(rowsOf(SWR_MAX_ROWS + 1), "all");
        expect(time).not.toHaveBeenCalled();
        expect(setItem).not.toHaveBeenCalled();
        expect(new Map(store)).toEqual(before);
        expect(readSwrCache("today-key")?.orders).toHaveLength(3);
        expect(H.report).not.toHaveBeenCalled();
    });

    it(`skips a result over ${SWR_MAX_CHARS.toLocaleString()} chars, and keeps the existing snapshot`, () => {
        writeSwrCache(rowsOf(3), "today-key");
        const before = new Map(store);
        // 600 rows (under the row cap) of ~2.6K chars each.
        writeSwrCache(rowsOf(600, 2_600), "all");
        expect(new Map(store)).toEqual(before);
    });

    it("stores up to the row cap", () => {
        writeSwrCache(rowsOf(SWR_MAX_ROWS), "all");
        expect(readSwrCache("all")?.orders).toHaveLength(SWR_MAX_ROWS);
    });
});

describe("orders SWR cache errors are reported, not swallowed", () => {
    it("a quota error clears every key and is reported once per page load", () => {
        writeSwrCache(rowsOf(2), "all", "2026-10-19T08:00:00.000Z");
        const quota = new DOMException("full", "QuotaExceededError");
        vi.spyOn(sessionStorage, "setItem").mockImplementation(() => { throw quota; });

        writeSwrCache(rowsOf(2), "all");
        writeSwrCache(rowsOf(2), "all");
        expect([...store.keys()]).toEqual([]);
        expect(H.report).toHaveBeenCalledTimes(1);
        expect(H.report).toHaveBeenCalledWith(quota, expect.objectContaining({ operation: "orders-swr-write", extra: { rows: 2, chars: expect.any(Number) } }));
    });

    it("any other write error is reported every time", () => {
        vi.spyOn(sessionStorage, "setItem").mockImplementation(() => { throw new Error("weird"); });
        writeSwrCache(rowsOf(2), "all");
        writeSwrCache(rowsOf(2), "all");
        expect(H.report).toHaveBeenCalledTimes(2);
    });

    it("corrupt JSON is reported, cleared and read as nothing", () => {
        sessionStorage.setItem(CACHE_KEY, "{not json");
        sessionStorage.setItem(TS_KEY, String(Date.now()));
        sessionStorage.setItem(WINDOW_KEY, "all");
        expect(readSwrCache("all")).toBeNull();
        expect(H.report).toHaveBeenCalledWith(expect.any(SyntaxError), expect.objectContaining({ operation: "orders-swr-read" }));
        expect(sessionStorage.getItem(CACHE_KEY)).toBeNull();
    });
});

describe("orders SWR cache watermark", () => {
    it("stores the fetch-start mark with the snapshot and reads it back", () => {
        writeSwrCache(rowsOf(2), "all", "2026-10-19T08:00:00.000Z");
        expect(readSwrCache("all")?.mark).toBe("2026-10-19T08:00:00.000Z");
        writeSwrCache(rowsOf(2), "all");
        expect(sessionStorage.getItem(MARK_KEY)).toBeNull();
        expect(readSwrCache("all")?.mark).toBeNull();
    });
});

describe("orders SWR cache", () => {
    it("does not persist an empty result", () => {
        writeSwrCache([], "all");
        expect(sessionStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it("does not hydrate from an empty cache even when it is fresh", () => {
        // Exactly the production state: a fetch that legitimately returned zero
        // rows (a date filter over a quiet day) wrote `[]` with a fresh stamp.
        sessionStorage.setItem(CACHE_KEY, "[]");
        sessionStorage.setItem(TS_KEY, String(Date.now()));
        sessionStorage.setItem(WINDOW_KEY, "all");

        // null, not [] — null keeps React Query pending; [] would claim success.
        expect(readSwrCache("all")).toBeNull();
    });

    it("still hydrates a non-empty cache", () => {
        writeSwrCache([{ id: "a" }, { id: "b" }] as unknown as Rows, "all");
        expect(readSwrCache("all")?.orders).toHaveLength(2);
    });

    it("refuses a snapshot of a different window", () => {
        // A snapshot of today's rows must never hydrate an "All Orders" list:
        // that is what showed "Confirmed 1" over "No confirmed orders".
        writeSwrCache([{ id: "a" }] as unknown as Rows, "1791752400000-1791838799999");
        expect(readSwrCache("all")).toBeNull();
    });

    it("ignores a cache older than the 5-minute max age", () => {
        writeSwrCache([{ id: "a" }] as unknown as Rows, "all");
        // The real SWR_MAX_AGE_MS is 5 minutes; 2 minutes is still fresh.
        sessionStorage.setItem(TS_KEY, String(Date.now() - 6 * 60 * 1000));
        expect(readSwrCache("all")).toBeNull();
    });

    it("survives a corrupt cache without throwing a non-array through", () => {
        sessionStorage.setItem(CACHE_KEY, '{"not":"an array"}');
        sessionStorage.setItem(TS_KEY, String(Date.now()));
        sessionStorage.setItem(WINDOW_KEY, "all");
        expect(readSwrCache("all")).toBeNull();
    });
});
