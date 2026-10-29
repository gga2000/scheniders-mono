/**
 * Receive-back inbox rules. An after-sale line expected back is overdue when
 * it has waited longer than the store's overdue_days (default 10) since its
 * replacement or refund order was created.
 */

export const DEFAULT_OVERDUE_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysWaiting(createdAt: string, now: Date): number {
    return Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / DAY_MS));
}

export function isOverdue(createdAt: string, now: Date, overdueDays: number): boolean {
    return daysWaiting(createdAt, now) > overdueDays;
}

/** Outcomes that cost the store the item: they flag the customer for future swaps. */
export const LOSS_DISPOSITIONS = ["write_off", "not_returned"] as const;
