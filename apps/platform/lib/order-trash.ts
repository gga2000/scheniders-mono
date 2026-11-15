/**
 * Statuses of an order that has left the store. Such an order is cancelled or
 * returned, never moved to the trash (money-rules board O1, 2026-11-15):
 * trashing it put the goods back in stock, cancelled the courier parcel and
 * dropped the sale from reports. The database enforces the same rule
 * (trigger orders_refuse_shipped_trash); these helpers keep the screens and
 * the delete route in step with it.
 */
export const SHIPPED_ORDER_STATUSES = ["in_transit", "delivered", "completed"] as const;

const SHIPPED: ReadonlySet<string> = new Set(SHIPPED_ORDER_STATUSES);

/** True when the order may go to the trash. Merchant-guide practice orders always may. */
export function canMoveToTrash(order: { status: string; guide_practice?: boolean | null }): boolean {
    return order.guide_practice === true || !SHIPPED.has(order.status);
}

/** PostgREST `or` filter for the rows `canMoveToTrash` allows. */
export const TRASHABLE_ORDERS_FILTER = `status.not.in.(${SHIPPED_ORDER_STATUSES.join(",")}),guide_practice.is.true`;
