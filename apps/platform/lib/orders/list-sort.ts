import type { Order } from "@/types/order";
import { getScheduledState } from "@/lib/order-format-utils";

// =============================================
// ORDER LIST SORTS
//
// The three orders the /orders list passes through, in one place so the list
// preview (lib/orders/list-preview.ts) is checked against the comparators the
// pages actually run:
//
//   sortPinnedNewestFirst  useOrderFilters: pinned first, then newest first.
//   sortDesktopList        app/orders/page.tsx: pinned first, parked last, then
//                          the column sorts, else newest first.
//   sortMobileList         MobileOrdersPage: parked last, then newest first.
//
// All three sort IN PLACE and return the array. Array.prototype.sort is
// stable, so rows the comparator ties keep their incoming order — the
// server's (created_at desc, id desc), which resolves the sub-millisecond
// ties `Date.parse` cannot see.
// =============================================

export interface ListSortKey {
    key: string;
    direction: "asc" | "desc";
}

/** Each row's `created_at` in ms, parsed once: parsing inside the comparator allocated two Dates per comparison. */
function createdAtIndex(rows: readonly Order[]): (o: Order) => number {
    const ms = new Map<string, number>();
    for (const order of rows) {
        const parsed = Date.parse(order.created_at);
        ms.set(order.id, Number.isNaN(parsed) ? 0 : parsed);
    }
    return (o) => ms.get(o.id) ?? 0;
}

/** Parked: scheduled for a later Baghdad day. Not today's work, so it sinks below the live queue. */
export function isParked(order: Pick<Order, "scheduled_date">, now: number = Date.now()): boolean {
    return getScheduledState(order.scheduled_date, now) === "future";
}

export function sortPinnedNewestFirst(rows: Order[]): Order[] {
    const createdAt = createdAtIndex(rows);
    return rows.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return createdAt(b) - createdAt(a);
    });
}

export function sortDesktopList(rows: Order[], activeSorts: readonly ListSortKey[], now: number = Date.now()): Order[] {
    const createdAt = createdAtIndex(rows);
    // Orders parked for a later day stay in the list of the day they arrived
    // (where the status chips count them) but sink below the live queue.
    const parked = new Set(rows.filter((o) => isParked(o, now)).map((o) => o.id));

    return rows.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;

        const aParked = parked.has(a.id);
        const bParked = parked.has(b.id);
        if (aParked !== bParked) return aParked ? 1 : -1;

        for (const sc of activeSorts) {
            let aVal: unknown = a[sc.key as keyof Order];
            let bVal: unknown = b[sc.key as keyof Order];

            if (sc.key === "amount") { aVal = Number(a.price); bVal = Number(b.price); }
            if (sc.key === "order_id") { aVal = a.sequence_number || a.order_id; bVal = b.sequence_number || b.order_id; }
            if (sc.key === "created_at") { aVal = createdAt(a); bVal = createdAt(b); }

            if (aVal != null && bVal != null && aVal < bVal) return sc.direction === "asc" ? -1 : 1;
            if (aVal != null && bVal != null && aVal > bVal) return sc.direction === "asc" ? 1 : -1;
        }

        if (activeSorts.length > 0) return 0;

        return createdAt(b) - createdAt(a);
    });
}

export function sortMobileList(rows: Order[], now: number = Date.now()): Order[] {
    const createdAt = createdAtIndex(rows);
    const parked = new Set(rows.filter((o) => isParked(o, now)).map((o) => o.id));
    return rows.sort((a, b) => {
        const aParked = parked.has(a.id);
        const bParked = parked.has(b.id);
        if (aParked !== bParked) return aParked ? 1 : -1;
        return createdAt(b) - createdAt(a);
    });
}
