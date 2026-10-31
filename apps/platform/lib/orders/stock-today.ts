import type { Database } from "@scheniders/supabase";

export type StockTodayRow = Database["public"]["Functions"]["get_stock_today"]["Returns"][number];

/** One pile of stock: new boxes, or open boxes. */
export interface StockLane {
    /** On the shelf now. Leaves only when an order ships. */
    onHand: number;
    /** Held by confirmed orders that have not shipped. */
    reserved: number;
    /** Free to sell: on hand minus reserved. Below zero means oversold. */
    left: number;
    /** Units on today's orders (Baghdad day), not cancelled. */
    today: number;
    /** Units on new / contacted orders. They hold nothing until confirmed. */
    waiting: number;
}

/**
 * oversold: more is confirmed than is on the shelf.
 * short:    enough today, but not if the waiting orders confirm.
 * out:      nothing left.
 * low:      at or below the alert level.
 */
export type StockState = "oversold" | "short" | "out" | "low" | "ok";

export interface StockTodayItem {
    key: string;
    productId: string;
    name: string;
    /** What the team calls it ("انفوي"); the full catalogue name is only the fallback. */
    shortName: string;
    variantName: string | null;
    sku: string | null;
    imageUrl: string | null;
    lowAt: number;
    fresh: StockLane;
    /** Null when the product has no open-box stock and no open-box orders. */
    openBox: StockLane | null;
    state: StockState;
}

const RANK: Record<StockState, number> = { oversold: 0, short: 1, out: 2, low: 3, ok: 4 };

/** An open box is a single unit; one left is already the last one. */
export const OPEN_BOX_LOW_AT = 1;

/** i18n key and English fallback for each state. */
export const STOCK_STATE_LABEL: Record<StockState, [string, string]> = {
    oversold: ["orders.stockToday.state.oversold", "Oversold"],
    short: ["orders.stockToday.state.short", "Short if confirmed"],
    out: ["orders.stockToday.state.out", "Sold out"],
    low: ["orders.stockToday.state.low", "Running low"],
    ok: ["orders.stockToday.state.ok", "In stock"],
};

export function laneState(lane: StockLane, lowAt: number): StockState {
    if (lane.left < 0) return "oversold";
    if (lane.left - lane.waiting < 0) return "short";
    if (lane.left === 0) return "out";
    if (lane.left <= lowAt) return "low";
    return "ok";
}

function worst(a: StockState, b: StockState): StockState {
    return RANK[a] <= RANK[b] ? a : b;
}

function freshLane(r: StockTodayRow): StockLane {
    return {
        onHand: r.on_hand,
        reserved: r.reserved,
        left: r.on_hand - r.reserved,
        today: r.today_new,
        waiting: r.waiting_new,
    };
}

/**
 * open_box_quantity is taken down as soon as an open-box order is confirmed,
 * so it already is what is left; the shelf holds that plus what confirmed
 * orders reserve.
 */
function openBoxLane(r: StockTodayRow): StockLane | null {
    const lane: StockLane = {
        onHand: r.ob_left + r.ob_reserved,
        reserved: r.ob_reserved,
        left: r.ob_left,
        today: r.today_ob,
        waiting: r.waiting_ob,
    };
    const used = lane.onHand !== 0 || lane.left !== 0 || lane.today > 0 || lane.waiting > 0;
    return used ? lane : null;
}

function isIdle(r: StockTodayRow): boolean {
    return r.on_hand === 0 && r.reserved === 0 && r.ob_left === 0 && r.ob_reserved === 0
        && r.today_new === 0 && r.today_ob === 0 && r.waiting_new === 0 && r.waiting_ob === 0;
}

/**
 * Turns the RPC rows into what the dialog lists, worst first.
 *
 * Filler products are left out: they are catalogue depth that is not held in
 * stock, so their counts say nothing about overselling. A product that has
 * variants shows its variants; its own row is kept only if orders or stock
 * still sit on it directly.
 */
export function buildStockToday(rows: readonly StockTodayRow[]): StockTodayItem[] {
    const withVariants = new Set(rows.filter(r => r.variant_id).map(r => r.product_id));
    const items: StockTodayItem[] = [];
    for (const r of rows) {
        if (r.is_filler) continue;
        if (!r.variant_id && withVariants.has(r.product_id) && isIdle(r)) continue;
        const lowAt = r.low_stock_threshold;
        const fresh = freshLane(r);
        const openBox = openBoxLane(r);
        const state = openBox
            ? worst(laneState(fresh, lowAt), laneState(openBox, OPEN_BOX_LOW_AT))
            : laneState(fresh, lowAt);
        items.push({
            key: r.variant_id ?? r.product_id,
            productId: r.product_id,
            name: r.name,
            shortName: r.short_name?.trim() || r.name,
            variantName: r.variant_name,
            sku: r.sku,
            imageUrl: r.image_url,
            lowAt,
            fresh,
            openBox,
            state,
        });
    }
    return items.sort((a, b) =>
        RANK[a.state] - RANK[b.state]
        || (b.fresh.today + (b.openBox?.today ?? 0)) - (a.fresh.today + (a.openBox?.today ?? 0))
        || a.fresh.left - b.fresh.left
        || a.shortName.localeCompare(b.shortName));
}

export type StockFilter = "all" | "oversold" | "attention" | "today";
export type StockLaneFilter = "both" | "new" | "openBox";

export function filterStockToday(
    items: readonly StockTodayItem[],
    filter: StockFilter,
    lane: StockLaneFilter,
    query: string,
): StockTodayItem[] {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
        if (lane === "openBox" && !it.openBox) return false;
        if (q && !(it.name.toLowerCase().includes(q)
            || it.shortName.toLowerCase().includes(q)
            || (it.variantName ?? "").toLowerCase().includes(q)
            || (it.sku ?? "").toLowerCase().includes(q))) return false;
        switch (filter) {
            case "oversold": return it.state === "oversold";
            case "attention": return it.state !== "ok";
            case "today": return it.fresh.today + (it.openBox?.today ?? 0) > 0;
            default: return true;
        }
    });
}

export function stockTodaySummary(items: readonly StockTodayItem[]) {
    return {
        all: items.length,
        oversold: items.filter(i => i.state === "oversold").length,
        attention: items.filter(i => i.state !== "ok").length,
        todayUnits: items.reduce((n, i) => n + i.fresh.today + (i.openBox?.today ?? 0), 0),
    };
}
