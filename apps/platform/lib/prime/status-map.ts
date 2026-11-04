/**
 * What a Prime shipment status means for our order.
 *
 * Only a plain delivery moves the order: everything else that needs a person
 * raises the order's delivery attention flag and leaves the status alone.
 *  - A return is NOT set to `rejected` here: the returns desk does that when
 *    the parcel is scanned back in, and routes the stock (process_return). A
 *    rejected order arriving at the returns desk reads as an anomaly there.
 *  - Partial deliveries and courier price changes change the money; the Prime
 *    payment PDF import resolves them, as it does today.
 */

export type PrimeAttentionReason =
    | "delivery_partial_delivery"
    | "delivery_price_changed"
    | "delivery_returning"
    | "delivery_courier_cancelled";

export type PrimeOrderAction =
    | { kind: "deliver" }
    | { kind: "flag"; reason: PrimeAttentionReason }
    | { kind: "none" };

/** Every attention reason the Prime sync raises, so it can replace its own earlier one. */
export const PRIME_ATTENTION_REASONS: readonly PrimeAttentionReason[] = [
    "delivery_partial_delivery",
    "delivery_price_changed",
    "delivery_returning",
    "delivery_courier_cancelled",
];

export function primeStatusAction(status: string | null | undefined): PrimeOrderAction {
    switch (status) {
        case "DELIVERED":
            return { kind: "deliver" };
        case "PART_DELIVERED":
            return { kind: "flag", reason: "delivery_partial_delivery" };
        case "DELIVERED_CHANGE_PRICE":
            return { kind: "flag", reason: "delivery_price_changed" };
        case "FAILED_DELIVER_RETURNED_TO_SENDER":
            return { kind: "flag", reason: "delivery_returning" };
        case "CNCL":
            return { kind: "flag", reason: "delivery_courier_cancelled" };
        default:
            // ONWAY, POSTPONED and anything new: still with the courier.
            return { kind: "none" };
    }
}

/** Order statuses Prime still delivers: the only ones whose edits go to Prime. */
const EDITABLE_ORDER_STATUSES: ReadonlySet<string> = new Set(["confirmed", "in_transit"]);

/**
 * Whether staff edits of an order still reach its Prime parcel: the order is
 * open (confirmed or in transit) and Prime has not finished with the parcel
 * (delivered, coming back, cancelled). The edit queue and the edit review
 * read the same rule.
 */
export function primeTakesEdits(orderStatus: string, shipmentStatus: string | null | undefined): boolean {
    return EDITABLE_ORDER_STATUSES.has(orderStatus) && primeStatusAction(shipmentStatus).kind === "none";
}

/**
 * The order's attention reasons after a Prime flag: the new reason replaces
 * any earlier Prime reason and keeps everyone else's.
 */
export function withPrimeAttention(current: readonly string[] | null | undefined, reason: PrimeAttentionReason): string[] {
    const others = (current ?? []).filter((r) => !(PRIME_ATTENTION_REASONS as readonly string[]).includes(r));
    return [...others, reason];
}

/**
 * Raised by the link itself when Prime would not take a change staff made:
 *  - edit refused: Prime kept the old details (its step no longer allows
 *    edits, or the order now holds a value Prime cannot take). Cleared once
 *    Prime holds the order's details again, or the order closes.
 *  - cancel by hand: the order was cancelled but Prime already has the
 *    parcel. Cleared once Prime closes the case (returned, cancelled or
 *    delivered) or the order is reopened.
 */
export const PRIME_EDIT_REFUSED = "delivery_prime_edit_refused";
export const PRIME_CANCEL_BY_HAND = "delivery_prime_cancel_by_hand";

/** Prime flags that have done their job once the order is delivered or closed. */
export const PRIME_SETTLED_REASONS: readonly string[] = [...PRIME_ATTENTION_REASONS, PRIME_EDIT_REFUSED];

type AttentionPatch = { needs_attention: boolean; attention_reasons: string[] };

/** The order's attention with `reason` added; null when it already carries it. */
export function withAttention(current: readonly string[] | null | undefined, reason: string): AttentionPatch | null {
    const reasons = current ?? [];
    if (reasons.includes(reason)) return null;
    return { needs_attention: true, attention_reasons: [...reasons, reason] };
}

/** The order's attention without `drop`, everyone else's kept; null when it carried none of them. */
export function withoutAttention(current: readonly string[] | null | undefined, drop: readonly string[]): AttentionPatch | null {
    const reasons = current ?? [];
    const others = reasons.filter((r) => !drop.includes(r));
    if (others.length === reasons.length) return null;
    return { needs_attention: others.length > 0, attention_reasons: others };
}

/**
 * The order's attention after Prime delivered it, or after a person closed
 * it: earlier Prime flags (a return that was re-delivered, a refused edit)
 * are dropped, everyone else's stay. Null when the order carried no such
 * flag, so nothing needs writing.
 */
export function clearPrimeAttention(current: readonly string[] | null | undefined): AttentionPatch | null {
    return withoutAttention(current, PRIME_SETTLED_REASONS);
}
