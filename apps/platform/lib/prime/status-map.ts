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

/**
 * The order's attention reasons after a Prime flag: the new reason replaces
 * any earlier Prime reason and keeps everyone else's.
 */
export function withPrimeAttention(current: readonly string[] | null | undefined, reason: PrimeAttentionReason): string[] {
    const others = (current ?? []).filter((r) => !(PRIME_ATTENTION_REASONS as readonly string[]).includes(r));
    return [...others, reason];
}

/**
 * The order's attention after Prime delivered it: earlier Prime flags (a
 * return that was re-delivered, say) are dropped, everyone else's stay.
 * Null when the order carried no Prime flag, so nothing needs writing.
 */
export function clearPrimeAttention(
    current: readonly string[] | null | undefined,
): { needs_attention: boolean; attention_reasons: string[] } | null {
    const reasons = current ?? [];
    const others = reasons.filter((r) => !(PRIME_ATTENTION_REASONS as readonly string[]).includes(r));
    if (others.length === reasons.length) return null;
    return { needs_attention: others.length > 0, attention_reasons: others };
}
