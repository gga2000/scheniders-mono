/**
 * Orders that came in while the shop was billing-locked (handoff A1). The
 * database stamps `orders.billing_phase` when the order is made and never
 * changes it (20261116014641_billing_lock_instead_of_suspend.sql).
 */
export const LOCK_PHASES = ["trial_locked", "unpaid_locked"] as const;

/** The «طلبات وصلت وقت القفل» chip looks back this far, so it leaves on its own a month after a lock. */
export const LOCK_ORDERS_DAYS = 30;

/** Start of the chip's window, as an ISO instant. */
export function lockOrdersSince(now: Date = new Date()): string {
    return new Date(now.getTime() - LOCK_ORDERS_DAYS * 86_400_000).toISOString();
}
