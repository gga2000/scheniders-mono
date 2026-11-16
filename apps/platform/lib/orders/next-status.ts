import type { OrderStatus } from "@/types/order";

/**
 * The usual next status after each one: the move staff made by hand most
 * often on the last 500 orders (counted 16 Nov 2026), so the order window can
 * offer it as one button.
 *
 * new → contacted 309, contacted → confirmed 266, confirmed → in_transit 327,
 * in_transit → completed 123 (→ delivered 10), delivered → completed 186,
 * pending_checkout → contacted 38. A return goes return_pending → in_transit (19).
 *
 * A status that ends the order, or has no usual move (no_response, suspended,
 * a return already on its way back), has none: the status menu covers it.
 */
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
    new: "contacted",
    contacted: "confirmed",
    confirmed: "in_transit",
    in_transit: "completed",
    delivered: "completed",
    pending_checkout: "contacted",
};

const NEXT_FOR_RETURN: Partial<Record<OrderStatus, OrderStatus>> = {
    return_pending: "in_transit",
};

export function nextOrderStatus(status: OrderStatus, isReturn: boolean): OrderStatus | null {
    return (isReturn ? NEXT_FOR_RETURN : NEXT)[status] ?? null;
}
