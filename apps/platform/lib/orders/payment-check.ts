import type { OrderStatus } from "@/types/order";

/**
 * "Payment checked" (the Reviewed ✓ tick, Ali 2026-11-02): staff tick a delivered
 * or completed order once the courier's money for it is matched.
 */
export const PAYMENT_CHECK_STATUSES: readonly OrderStatus[] = ["delivered", "completed"];

/** The "Payment not checked" queue looks back this far; older orders were settled before the tick meant payment. */
export const PAYMENT_CHECK_DAYS = 30;

export function canCheckPayment(status: OrderStatus | null | undefined): boolean {
    return !!status && PAYMENT_CHECK_STATUSES.includes(status);
}

/** Start of the queue window, as an ISO instant. */
export function paymentCheckSince(now: Date = new Date()): string {
    return new Date(now.getTime() - PAYMENT_CHECK_DAYS * 86_400_000).toISOString();
}
