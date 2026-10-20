import { describe, it, expect } from "vitest";
import type { Order, OrderFilters } from "@/lib/supabase";
import { filterOrders } from "@/lib/orders/filter-orders";
import { sortDesktopList, sortMobileList, sortPinnedNewestFirst } from "@/lib/orders/list-sort";
import {
    PREVIEW_HEAD_ROWS,
    PREVIEW_MIN_SPAN_MS,
    desktopPreviewRows,
    mergePreviewHead,
    mobilePreviewRows,
    windowWantsPreview,
} from "@/lib/orders/list-preview";

/*
 * The All Orders preview paints the newest rows (plus every pinned row) before
 * the full window has loaded. It is only correct if, on commit, no row it shows
 * moves: for ANY book and ANY row-local filter, the preview list must be a
 * prefix of the full list, on both page comparators. Driven by a seeded PRNG
 * so a failure reproduces.
 */

const NOW = Date.parse("2026-10-20T09:00:00.000Z");

function prng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const STATUSES = ["new", "contacted", "confirmed", "in_transit", "delivered", "completed", "cancelled", "no_response"] as const;
const CITIES = ["Baghdad", "Basra", "Erbil", "Najaf"];
const CHIPS: OrderFilters["status"][] = ["all", "new", "confirmed", "delivered", "completed", "refunds", "no_response"];

/** Microsecond timestamps from a small pool, so ties (exact and sub-millisecond) are common. */
function stamp(rand: () => number): { iso: string; us: number } {
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    const ms = base + Math.floor(rand() * 40) * 3_600_000 + Math.floor(rand() * 3);
    const micro = Math.floor(rand() * 3) * 250;
    const iso = new Date(ms).toISOString().replace("Z", String(micro).padStart(3, "0") + "Z");
    return { iso, us: ms * 1000 + micro };
}

function book(rand: () => number): { rows: Order[]; dbOrder: Order[] } {
    const n = Math.floor(rand() * 260);
    const keyed = Array.from({ length: n }, (_, i) => {
        const { iso, us } = stamp(rand);
        const r = rand();
        const scheduled = r < 0.7 ? null : r < 0.8 ? "2026-10-01" : r < 0.88 ? "2026-10-20" : "2026-10-24";
        const order = {
            id: `id-${String(Math.floor(rand() * 1e6)).padStart(6, "0")}-${i}`,
            tenant_id: "t",
            order_id: rand() < 0.05 ? `RPL-${i}` : `LF-${i}`,
            customer_name: "c",
            phone: `0770${String(i).padStart(7, "0")}`,
            city: CITIES[Math.floor(rand() * CITIES.length)],
            items: [],
            price: 1,
            status: STATUSES[Math.floor(rand() * STATUSES.length)],
            priority: rand() < 0.1 ? "urgent" : "normal",
            payment_status: "cod",
            created_at: iso,
            updated_at: iso,
            scheduled_date: scheduled,
            is_pinned: rand() < 0.06,
            is_return: rand() < 0.05,
            is_replacement: false,
            is_archived: false,
        } as unknown as Order;
        return { order, us };
    });
    // The server's order: created_at desc (exact, microseconds), then id desc.
    const dbOrder = [...keyed]
        .sort((a, b) => (b.us - a.us) || (a.order.id < b.order.id ? 1 : a.order.id > b.order.id ? -1 : 0))
        .map((k) => k.order);
    return { rows: keyed.map((k) => k.order), dbOrder };
}

function randomFilter(rand: () => number): OrderFilters {
    return {
        status: CHIPS[Math.floor(rand() * CHIPS.length)],
        city: rand() < 0.3 ? CITIES[Math.floor(rand() * CITIES.length)] : undefined,
        priority: rand() < 0.1 ? "urgent" : undefined,
    } as OrderFilters;
}

const ids = (rows: readonly Order[]) => rows.map((o) => o.id);

describe("the list preview is a prefix of the full list", () => {
    it("for random books, ties, pins, parked rows and row-local filters — desktop and mobile comparators", () => {
        let nonTrivial = 0;
        for (let seed = 1; seed <= 400; seed++) {
            const rand = prng(seed);
            const { dbOrder } = book(rand);
            const top = dbOrder.slice(0, PREVIEW_HEAD_ROWS);
            const pinned = dbOrder.filter((o) => o.is_pinned === true);
            const head = mergePreviewHead(pinned, top, dbOrder.length);
            const filter = randomFilter(rand);

            // The pipeline the page runs: useOrderFilters (filter, then its
            // own sort), then the page comparator.
            const full = sortPinnedNewestFirst(filterOrders(dbOrder, filter));
            const preview = sortPinnedNewestFirst(filterOrders(head.rows, filter));

            const desktopFull = sortDesktopList([...full], [], NOW);
            const desktop = desktopPreviewRows(preview, NOW);
            expect(ids(desktop), `desktop seed=${seed}`).toEqual(ids(desktopFull).slice(0, desktop.length));

            const mobileFull = sortMobileList([...full], NOW);
            const mobile = mobilePreviewRows(preview, head.newestCutoff, NOW);
            expect(ids(mobile), `mobile seed=${seed}`).toEqual(ids(mobileFull).slice(0, mobile.length));

            if (desktop.length > 0 && desktop.length < desktopFull.length) nonTrivial++;
        }
        // The property must have been exercised, not vacuously true.
        expect(nonTrivial).toBeGreaterThan(100);
    });

    it("a parked row in the head is dropped: it sinks below rows the head does not hold", () => {
        const live = (i: number, at: string) => ({ id: `l${i}`, created_at: at, status: "new", items: [] }) as unknown as Order;
        const parked = { id: "p", created_at: "2026-10-20T08:00:00.000Z", scheduled_date: "2026-10-24", status: "new", items: [] } as unknown as Order;
        const head = [parked, live(1, "2026-10-20T07:00:00.000Z")];
        expect(ids(desktopPreviewRows(head, NOW))).toEqual(["l1"]);
        expect(ids(mobilePreviewRows(head, null, NOW))).toEqual(["l1"]);
    });

    it("mobile keeps only rows newer than the cutoff: its comparator ignores the pin", () => {
        const pinnedOld = { id: "pin", created_at: "2026-01-01T00:00:00.000Z", is_pinned: true, status: "new", items: [] } as unknown as Order;
        const newest = { id: "n", created_at: "2026-10-20T07:00:00.000Z", status: "new", items: [] } as unknown as Order;
        const cut = { id: "c", created_at: "2026-10-20T06:00:00.000Z", status: "new", items: [] } as unknown as Order;
        const head = mergePreviewHead([pinnedOld], [newest, cut], 10);
        expect(ids(head.rows)).toEqual(["pin", "n", "c"]);
        expect(head.newestCutoff).toBe(cut.created_at);
        expect(ids(desktopPreviewRows(head.rows, NOW))).toEqual(["pin", "n", "c"]);
        // The cutoff row itself goes too: a pinned row on the same millisecond sorts before it.
        expect(ids(mobilePreviewRows(head.rows, head.newestCutoff, NOW))).toEqual(["n"]);
        // A head that holds the whole window has no cutoff.
        expect(mergePreviewHead([], [newest, cut], 2).newestCutoff).toBeNull();
    });
});

describe("mergePreviewHead", () => {
    it("puts pinned rows first, then the newest rows without the pinned ones, each once", () => {
        const o = (id: string, pinned = false) => ({ id, is_pinned: pinned }) as unknown as Order;
        const head = mergePreviewHead([o("b", true), o("x", true)], [o("a"), o("b", true), o("c")], 3);
        expect(ids(head.rows)).toEqual(["b", "x", "a", "c"]);
    });
});

describe("windowWantsPreview", () => {
    it("is on for All Orders and windows wider than a week, off for narrow ones", () => {
        expect(windowWantsPreview(null)).toBe(true);
        const w = (span: number) => ({ fromInstant: 0, toInstant: span, fromDay: "2026-10-01", toDay: "2026-10-08" });
        expect(windowWantsPreview(w(PREVIEW_MIN_SPAN_MS))).toBe(false);
        expect(windowWantsPreview(w(PREVIEW_MIN_SPAN_MS + 1))).toBe(true);
        expect(windowWantsPreview(w(86_400_000))).toBe(false);
    });
});
