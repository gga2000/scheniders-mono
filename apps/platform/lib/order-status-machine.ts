/**
 * Order status transition rules.
 *
 * COR-3 asked for a state machine because any status can currently move to any
 * other. Before writing one, the real transition graph was pulled from
 * `order_status_history`: **60 distinct from → to pairs occur in the last six
 * months alone**, and the "wrong-looking" ones are not all historical. Orders go
 * `confirmed → delivered` (skipping in_transit), `rejected → delivered`,
 * `cancelled → in_transit`, `completed → confirmed`. Those are corrections staff
 * make against reality, not bugs.
 *
 * A machine that rejected them would block people mid-shift, which is worse than
 * the permissiveness it replaces. So this module classifies rather than forbids:
 * it names the transitions that have no legitimate reading, and the callers
 * report them. Enforcement is a business decision and is deliberately not made
 * here — see the ledger entry for COR-3.
 */

import type { Order } from "@/types/order";

export type OrderStatus = Order["status"];

/** Statuses in which the order has not yet been handed to a courier. */
export const PRE_FULFILMENT_STATUSES: readonly OrderStatus[] = [
    "new",
    "contacted",
    "no_response",
    "pending_checkout",
    "suspended",
];

/** Statuses that mean the order reached, or failed to reach, the customer. */
export const FULFILMENT_OUTCOME_STATUSES: readonly OrderStatus[] = [
    "delivered",
    "completed",
    "refund_delivered",
];

export type TransitionVerdict =
    | { kind: "normal" }
    | { kind: "unusual"; reason: string };

/**
 * Classify a status change.
 *
 * `unusual` means "no legitimate reading of this exists" — currently only one
 * shape: an order reporting a fulfilment outcome without ever having been
 * shipped. Everything a courier or an operator correction can plausibly produce
 * is `normal`, including the reversals that look odd but happen daily.
 */
export function classifyTransition(from: OrderStatus, to: OrderStatus): TransitionVerdict {
    if (from === to) return { kind: "normal" };

    if (
        PRE_FULFILMENT_STATUSES.includes(from) &&
        FULFILMENT_OUTCOME_STATUSES.includes(to)
    ) {
        return {
            kind: "unusual",
            reason: `An order cannot go straight from "${from}" to "${to}" — it was never shipped.`,
        };
    }

    return { kind: "normal" };
}

/** Convenience predicate for callers that only need the boolean. */
export function isUnusualTransition(from: OrderStatus, to: OrderStatus): boolean {
    return classifyTransition(from, to).kind === "unusual";
}
