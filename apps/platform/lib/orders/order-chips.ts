import type { Order } from "@/types/order";

// =============================================
// ORDER STATUS CHIPS
//
// One table says what each status chip on /orders means. The list filter
// (`filterOrders`) and the chip counts (`countOrderChips`) both read it, so the
// number on a chip and the length of the list it opens are the same predicate
// applied to the same rows: they cannot disagree.
//
// They used to be two definitions. The list filtered in useOrderFilters, the
// chips came from `get_orders_aggregates`, and the two differed for completed,
// refunds, refunded, refund pending and replacements (2026-10-18, tenant b5c4:
// completed 3104 vs 3019, refunded 0 vs 53). The RPC is now only used where a
// figure is not a count of a list the page can open.
// =============================================

/** Every chip the status row renders (components/orders/sticky-filter-bar.tsx), in order. */
export const ORDER_CHIP_IDS = [
    "all", "new", "contacted", "confirmed", "in_transit", "pending_checkout", "delivered",
    "completed", "cancelled", "rejected", "refunds", "refunded", "refund_pending",
    "replacements", "suspended", "no_response",
] as const;

export type OrderChipId = (typeof ORDER_CHIP_IDS)[number];
export type OrderChipCounts = Record<OrderChipId, number>;

/** The row fields a chip predicate may read. Pinned by order-chips.test.ts and order-columns.test.ts. */
export const CHIP_PREDICATE_FIELDS = ["status", "refund_status", "is_replacement", "is_return", "order_id"] as const satisfies readonly (keyof Order)[];

type ChipRow = Pick<Order, (typeof CHIP_PREDICATE_FIELDS)[number]>;

/** A replacement order: flagged, or numbered with the RPL- prefix (rows created before the flag existed). */
export function isReplacementOrder(o: Pick<Order, "is_replacement" | "order_id">): boolean {
    return o.is_replacement === true || o.order_id?.startsWith("RPL-") === true;
}

const refundOf = (o: ChipRow) => o.refund_status ?? "none";

export const ORDER_CHIP_PREDICATES: { readonly [K in OrderChipId]: (o: ChipRow) => boolean } = {
    all: () => true,
    new: (o) => o.status === "new",
    contacted: (o) => o.status === "contacted",
    // A return awaiting pickup is confirmed work for the courier.
    confirmed: (o) => o.status === "confirmed" || o.status === "return_pending",
    in_transit: (o) => o.status === "in_transit",
    pending_checkout: (o) => o.status === "pending_checkout",
    delivered: (o) => o.status === "delivered",
    // Owner decision (default): genuine sales only. Refunded, refund-pending and
    // replacement orders live in their own chips.
    completed: (o) => {
        const refund = refundOf(o);
        return o.status === "completed" && refund !== "refunded" && refund !== "pending" && !isReplacementOrder(o);
    },
    cancelled: (o) => o.status === "cancelled",
    rejected: (o) => o.status === "rejected",
    // Owner decision (default): every return transaction, at any point in its
    // lifecycle — the same rule as the `orderType: 'refund'` and `isReturn` filters.
    refunds: (o) => o.is_return === true,
    // Fully or partly refunded originals. A partly refunded order is still a
    // sale (net of the refund), so it also stays in "completed".
    refunded: (o) => refundOf(o) === "refunded" || refundOf(o) === "partial",
    refund_pending: (o) => refundOf(o) === "pending",
    replacements: isReplacementOrder,
    suspended: (o) => o.status === "suspended",
    no_response: (o) => o.status === "no_response",
};

const CHIP_ID_SET: ReadonlySet<string> = new Set(ORDER_CHIP_IDS);

export function isOrderChipId(s: string): s is OrderChipId {
    return CHIP_ID_SET.has(s);
}

/** All 16 chip counts in one pass. `counts[c] === rows.filter(ORDER_CHIP_PREDICATES[c]).length`. */
export function countOrderChips(rows: readonly ChipRow[]): OrderChipCounts {
    const counts = Object.fromEntries(ORDER_CHIP_IDS.map((id) => [id, 0])) as OrderChipCounts;
    for (const row of rows) {
        for (const id of ORDER_CHIP_IDS) {
            if (ORDER_CHIP_PREDICATES[id](row)) counts[id]++;
        }
    }
    return counts;
}
