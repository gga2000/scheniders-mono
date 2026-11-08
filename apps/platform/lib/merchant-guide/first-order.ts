// =====================================================================
// Phase 2 of the merchant guide: "First order"
// =====================================================================
// The guide makes three practice orders (orders.guide_practice, stamped
// «تجربة») and walks the merchant through a day's work with them: what each
// status means, confirming an order, the WhatsApp bot, and the dispatch desk
// at the end of the day. Practice orders never reach a courier, a customer
// or any money figure, and they are binned when the phase ends or after 24h.
//
// The stops that ask the merchant to do something (confirm, print) tick from
// the practice orders themselves; the two that only explain (statuses,
// WhatsApp) tick when the merchant moves on.
// =====================================================================

import type { GuideLineId } from "./script";

export const FIRST_ORDER_STOPS = ["statuses", "confirm", "whatsapp", "dispatch"] as const;
export type FirstOrderStop = (typeof FIRST_ORDER_STOPS)[number];

/** Stops that only explain; the merchant moves past them. */
export type FirstOrderReadStop = Extract<FirstOrderStop, "statuses" | "whatsapp">;

/** This person's phase-2 record (merchant_guide_progress.phases.first_order). */
export interface FirstOrderRecord {
    started_at?: string;
    /** "Later" on the offer: asked again on a later visit to Orders. */
    later_at?: string;
    done_at?: string;
    seen?: FirstOrderReadStop[];
}

/** What the guide reads from each practice order. */
export interface PracticeOrder {
    id: string;
    status: string;
    print_count: number | null;
}

/** "Later" hides the offer for this long. */
export const FIRST_ORDER_LATER_MS = 24 * 3_600_000;

/** Statuses at or past confirmation, for a practice order. */
const CONFIRMED_OR_PAST = new Set(["confirmed", "in_transit", "delivered", "completed"]);

/** The status walk on the statuses stop, left to right as the tabs read. */
export const STATUS_WALK = ["new", "contacted", "confirmed", "in_transit", "delivered", "completed"] as const;

export const FIRST_ORDER_PLACES: Record<FirstOrderStop, { path: string; selector: string; line: GuideLineId; labelKey: string; checkKey: string }> = {
    statuses: {
        path: "/orders",
        selector: '[data-guide="order-status-tabs"]',
        line: "fo.statuses",
        labelKey: "guide.fo.step.statuses",
        checkKey: "guide.fo.check.statuses",
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

function stopDone(stop: FirstOrderStop, record: FirstOrderRecord, orders: readonly PracticeOrder[]): boolean {
    switch (stop) {
        case "statuses":
        case "whatsapp":
            return record.seen?.includes(stop) ?? false;
        case "confirm":
            return practiceConfirmed(orders);
        case "dispatch":
            return practicePrinted(orders);
    }
}

/** The first stop not done yet, in order; null once every stop is done. */
export function nextFirstOrderStop(record: FirstOrderRecord, orders: readonly PracticeOrder[]): FirstOrderStop | null {
    return FIRST_ORDER_STOPS.find((stop) => !stopDone(stop, record, orders)) ?? null;
}

export function firstOrderDoneCount(record: FirstOrderRecord, orders: readonly PracticeOrder[]): number {
    return FIRST_ORDER_STOPS.filter((stop) => stopDone(stop, record, orders)).length;
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
 * What phase 2 shows now. `orders` is null while the practice orders are
 * still loading. The offer appears only on the Orders page, and a "Later"
 * waits a day.
 */
export function firstOrderView(
    record: FirstOrderRecord | undefined,
    orders: readonly PracticeOrder[] | null,
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
    if (orders === null) return { kind: "none" };
    const next = nextFirstOrderStop(r, orders);
    if (next === null) return { kind: "finished" };
    if (orders.length === 0) return { kind: "expired" };
    return { kind: "stop", stop: next };
}
