// =====================================================================
// Phase 2 of the merchant guide: "First order"
// =====================================================================
// The guide makes three practice orders (orders.guide_practice, stamped
// «تجربة») and walks the merchant through a day's work: what each status
// means, an order placed on their own store, confirming an order, switching
// on the WhatsApp bot, picking who delivers, and the dispatch desk at the end
// of the day (Fermi B11). Practice orders never reach a courier, a customer
// or any money figure, and they are binned when the phase ends or after 24h.
// The order from their own store is placed in draft view, so it is a test
// order (is_test, source storefront): no WhatsApp, no fee, no trial count,
// and the guide bins it with the practice orders when the phase ends.
//
// The stops that ask the merchant to do something tick from the shop itself:
// the store order and confirm and print from the orders, WhatsApp from the
// auto-send switch, the courier from a Prime link or the merchant's pick.
// The statuses stop only explains and ticks when the merchant moves on;
// WhatsApp can be put off the same way.
// =====================================================================

import type { GuideLineId } from "./script";

export const FIRST_ORDER_STOPS = ["statuses", "store_order", "confirm", "whatsapp", "courier", "dispatch"] as const;
export type FirstOrderStop = (typeof FIRST_ORDER_STOPS)[number];

/** Stops the merchant can move past without doing anything. */
export type FirstOrderReadStop = Extract<FirstOrderStop, "statuses" | "whatsapp">;

/** Who delivers: Prime (asked from the Prime page) or another company (its export layout). */
export type FirstOrderCourier = "prime" | "other";

/** This person's phase-2 record (merchant_guide_progress.phases.first_order). */
export interface FirstOrderRecord {
    started_at?: string;
    /** "Later" on the offer: asked again on a later visit to Orders. */
    later_at?: string;
    done_at?: string;
    seen?: FirstOrderReadStop[];
    courier?: FirstOrderCourier;
}

/** What the guide reads from each practice order and each store test order. */
export interface PracticeOrder {
    id: string;
    status: string;
    print_count: number | null;
    /** "storefront" for the order the merchant placed on their own store. */
    source: string | null;
}

/** What the shop has switched on, read beside the orders. */
export interface FirstOrderFacts {
    autoSendOn: boolean;
    primeLinked: boolean;
}

/** "Later" hides the offer for this long. */
export const FIRST_ORDER_LATER_MS = 24 * 3_600_000;

/** Statuses at or past confirmation, for a practice order. */
const CONFIRMED_OR_PAST = new Set(["confirmed", "in_transit", "delivered", "completed"]);

/** The status walk on the statuses stop, left to right as the tabs read. */
export const STATUS_WALK = ["new", "contacted", "confirmed", "in_transit", "delivered", "completed"] as const;

export const FIRST_ORDER_PLACES: Record<FirstOrderStop, { path: string; selector: string | null; line: GuideLineId; labelKey: string; checkKey: string }> = {
    statuses: {
        path: "/orders",
        selector: '[data-guide="order-status-tabs"]',
        line: "fo.statuses",
        labelKey: "guide.fo.step.statuses",
        checkKey: "guide.fo.check.statuses",
    },
    // Happens on the store, in its own tab; the card waits on Orders.
    store_order: {
        path: "/orders",
        selector: null,
        line: "fo.storeOrder",
        labelKey: "guide.fo.step.storeOrder",
        checkKey: "guide.fo.check.storeOrder",
    },
    confirm: {
        path: "/orders",
        selector: '[data-guide="practice-confirm"]',
        line: "fo.confirm",
        labelKey: "guide.fo.step.confirm",
        checkKey: "guide.fo.check.confirm",
    },
    whatsapp: {
        path: "/orders",
        selector: '[data-guide="auto-send"]',
        line: "fo.whatsapp",
        labelKey: "guide.fo.step.whatsapp",
        checkKey: "guide.fo.check.whatsapp",
    },
    // A choice made on the card, wherever the merchant is.
    courier: {
        path: "/orders",
        selector: null,
        line: "fo.courier",
        labelKey: "guide.fo.step.courier",
        checkKey: "guide.fo.check.courier",
    },
    dispatch: {
        path: "/printing",
        selector: '[data-guide="desk-print"]',
        line: "fo.dispatch",
        labelKey: "guide.fo.step.dispatch",
        checkKey: "guide.fo.check.dispatch",
    },
};

export function practiceConfirmed(orders: readonly PracticeOrder[]): boolean {
    return orders.some((o) => CONFIRMED_OR_PAST.has(o.status));
}

export function practicePrinted(orders: readonly PracticeOrder[]): boolean {
    return orders.some((o) => (o.print_count ?? 0) > 0);
}

/** The merchant's own order from their store has arrived. */
export function storeOrderPlaced(orders: readonly PracticeOrder[]): boolean {
    return orders.some((o) => o.source === "storefront");
}

function stopDone(stop: FirstOrderStop, record: FirstOrderRecord, orders: readonly PracticeOrder[], facts: FirstOrderFacts): boolean {
    switch (stop) {
        case "statuses":
            return record.seen?.includes(stop) ?? false;
        case "store_order":
            return storeOrderPlaced(orders);
        case "confirm":
            return practiceConfirmed(orders);
        case "whatsapp":
            return facts.autoSendOn || (record.seen?.includes(stop) ?? false);
        case "courier":
            return facts.primeLinked || record.courier !== undefined;
        case "dispatch":
            return practicePrinted(orders);
    }
}

/** The first stop not done yet, in order; null once every stop is done. */
export function nextFirstOrderStop(record: FirstOrderRecord, orders: readonly PracticeOrder[], facts: FirstOrderFacts): FirstOrderStop | null {
    return FIRST_ORDER_STOPS.find((stop) => !stopDone(stop, record, orders, facts)) ?? null;
}

export function firstOrderDoneCount(record: FirstOrderRecord, orders: readonly PracticeOrder[], facts: FirstOrderFacts): number {
    return FIRST_ORDER_STOPS.filter((stop) => stopDone(stop, record, orders, facts)).length;
}

export type FirstOrderView =
    /** Phase over, or nothing to show here. */
    | { kind: "none" }
    /** First visit to Orders after the basics: the offer card. */
    | { kind: "offer" }
    /** Started: the stop to show. */
    | { kind: "stop"; stop: FirstOrderStop }
    /** Every stop ticked: the closing card. */
    | { kind: "finished" }
    /** Started, but the practice orders are gone (24h passed, or binned by hand). */
    | { kind: "expired" };

/**
 * What phase 2 shows now. `orders` and `facts` are null while they are still
 * loading. The offer appears only on the Orders page, and a "Later" waits a
 * day.
 */
export function firstOrderView(
    record: FirstOrderRecord | undefined,
    orders: readonly PracticeOrder[] | null,
    facts: FirstOrderFacts | null,
    onOrdersPage: boolean,
    now: number,
): FirstOrderView {
    const r = record ?? {};
    if (r.done_at) return { kind: "none" };
    if (!r.started_at) {
        if (!onOrdersPage) return { kind: "none" };
        if (r.later_at && now - Date.parse(r.later_at) < FIRST_ORDER_LATER_MS) return { kind: "none" };
        return { kind: "offer" };
    }
    if (orders === null || facts === null) return { kind: "none" };
    const next = nextFirstOrderStop(r, orders, facts);
    if (next === null) return { kind: "finished" };
    // The store order alone cannot carry the walk: the practice orders are what the stops ask about.
    if (!orders.some((o) => o.source !== "storefront")) return { kind: "expired" };
    return { kind: "stop", stop: next };
}
