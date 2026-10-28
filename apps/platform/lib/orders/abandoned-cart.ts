import type { Order } from "@/types/order";

/**
 * What the abandoned-cart chip on an order says.
 *
 * The database stamps every order that started as an abandoned cart
 * (orders.abandoned_cart_at, never cleared) and records how it left the
 * Abandoned column (abandoned_cart_outcome). The chip shows on orders that
 * are past Abandoned: staff took the cart, or the customer came back and
 * ordered by themselves. Carts still open, and carts the system trashed
 * (junk, expired, already ordered), show none: the status already says so.
 */
export type AbandonedCartChip =
    | { kind: "contacted"; leftAt: string; by: string | null }
    | { kind: "returned"; leftAt: string };

type ChipFields = Pick<
    Order,
    "status" | "abandoned_cart_at" | "abandoned_cart_outcome" | "abandoned_cart_resolved_by_name"
>;

export function abandonedCartChip(order: ChipFields): AbandonedCartChip | null {
    const leftAt = order.abandoned_cart_at;
    if (!leftAt || order.status === "pending_checkout") return null;
    if (order.abandoned_cart_outcome === "contacted") {
        return { kind: "contacted", leftAt, by: order.abandoned_cart_resolved_by_name?.trim() || null };
    }
    if (order.abandoned_cart_outcome === "returned") {
        return { kind: "returned", leftAt };
    }
    return null;
}
