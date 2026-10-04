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

const store = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
});

import { readSwrCache, writeSwrCache } from "./use-orders-query";
import { windowFromDateFilter } from "@/lib/order-window";

type Orders = Parameters<typeof writeSwrCache>[0];
const rows = (...ids: string[]) => ids.map((id) => ({ id })) as unknown as Orders;
const today = windowFromDateFilter("2026-10-04", "2026-10-04");

beforeEach(() => store.clear());

describe("orders SWR cache", () => {
    it("does not persist an empty result", () => {
        writeSwrCache([], null);
        expect(sessionStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it("does not hydrate from an empty cache even when it is fresh", () => {
        // Exactly the production state: a fetch that legitimately returned zero
        // rows (a date filter over a quiet day) wrote `[]` with a fresh stamp.
        sessionStorage.setItem(CACHE_KEY, "[]");
        sessionStorage.setItem(TS_KEY, String(Date.now()));
        sessionStorage.setItem(WINDOW_KEY, "all");

        // null, not [] — null keeps React Query pending; [] would claim success.
        expect(readSwrCache(null)).toBeNull();
    });

    it("still hydrates a non-empty cache", () => {
        writeSwrCache(rows("a", "b"), null);
        expect(readSwrCache(null)).toHaveLength(2);
    });

    it("ignores a cache older than the 5-minute max age", () => {
        writeSwrCache(rows("a"), null);
        // The real SWR_MAX_AGE_MS is 5 minutes; 6 minutes is past it.
        sessionStorage.setItem(TS_KEY, String(Date.now() - 6 * 60 * 1000));
        expect(readSwrCache(null)).toBeNull();
    });

    it("survives a corrupt cache without throwing a non-array through", () => {
        sessionStorage.setItem(CACHE_KEY, '{"not":"an array"}');
        sessionStorage.setItem(TS_KEY, String(Date.now()));
        sessionStorage.setItem(WINDOW_KEY, "all");
        expect(readSwrCache(null)).toBeNull();
    });

    // ── The window the snapshot came from ──────────────────────────────────
    //
    // The snapshot used to record WHEN it was written but not WHICH window it
    // held. A "Today" fetch (14 rows) overwrote it; the next load under "All
    // Orders" hydrated those 14 as if they were everything. Being under the 30s
    // staleTime, React Query trusted them and did not refetch — so the status
    // chips, computed server-side, read "In Transit 76" over a list showing
    // "No orders found", until the staleTime lapsed and a refetch put it right.

    it("does not hydrate a single day's rows as the complete set", () => {
        writeSwrCache(rows("a", "b"), today);
        expect(readSwrCache(null)).toBeNull();
    });

    it("does not hydrate the complete set into a narrower window", () => {
        writeSwrCache(rows("a", "b", "c"), null);
        expect(readSwrCache(today)).toBeNull();
    });

    it("hydrates when the window matches", () => {
        writeSwrCache(rows("a", "b"), today);
        expect(readSwrCache(today)).toHaveLength(2);

        writeSwrCache(rows("a", "b", "c"), null);
        expect(readSwrCache(null)).toHaveLength(3);
    });

    it("does not trust a snapshot that never recorded its window", () => {
        // Every browser holding a snapshot from before this change. Its window
        // is unknowable, so the honest answer is to fetch rather than guess.
        sessionStorage.setItem(CACHE_KEY, JSON.stringify([{ id: "a" }]));
        sessionStorage.setItem(TS_KEY, String(Date.now()));
        expect(sessionStorage.getItem(WINDOW_KEY)).toBeNull();
        expect(readSwrCache(null)).toBeNull();
    });
});
