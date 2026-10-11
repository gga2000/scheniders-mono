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

import { readSwrCache, writeSwrCache } from "./use-orders-query";

beforeEach(() => store.clear());

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
