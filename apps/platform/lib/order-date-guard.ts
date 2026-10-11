import { toBaghdadDayKey } from "@/lib/order-window";

/**
 * `orders.created_at` is when an order arrived, and it cannot be in the
 * future: `trg_orders_created_at_not_future` raises SQLSTATE 23514 for any
 * value more than five minutes ahead of the database clock. Postponing an
 * order is `scheduled_date`. These helpers keep every client path on the
 * right side of that rule, and recognise the refusal when it happens anyway.
 */

/** Matches the trigger's own message, so an unrelated check violation is not mistaken for it. */
const FUTURE_CREATED_AT_MESSAGE = "created_at cannot be in the future";

/** Error code carried by FutureOrderDateError and by a failed update's result. */
export const FUTURE_ORDER_DATE_CODE = "future_order_date";

/**
 * Thrown by the repository when the database refuses a future `created_at`,
 * so callers can show it against the order-date field instead of as a toast.
 */
export class FutureOrderDateError extends Error {
    readonly code = FUTURE_ORDER_DATE_CODE;

    constructor() {
        super("The order date cannot be in the future. Use “Scheduled For” to postpone the order.");
        this.name = "FutureOrderDateError";
    }
}

/** Whether a Supabase/PostgREST error is the future-`created_at` trigger refusing a write. */
export function isFutureCreatedAtViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const { code, message } = error as { code?: unknown; message?: unknown };
    return code === "23514" && typeof message === "string" && message.includes(FUTURE_CREATED_AT_MESSAGE);
}

/**
 * Whether a timestamp is ahead of the clock by more than `toleranceMs`.
 * The tolerance absorbs a picker that resolves "now" a few seconds before the
 * save goes out; the database itself allows five minutes.
 */
export function isFutureInstant(iso: string | null | undefined, now: number = Date.now(), toleranceMs = 60_000): boolean {
    if (!iso) return false;
    const at = Date.parse(iso);
    return !Number.isNaN(at) && at > now + toleranceMs;
}

/**
 * Route the create-order form's date to the right column.
 *
 * A past date is a back-dated placement and goes to `created_at`. A future one
 * is a postponement and goes to `scheduled_date`, as the Baghdad day it falls
 * on — never to `created_at`, which the database would reject (the old code
 * did that in a fire-and-forget update, so the refusal was silently lost and
 * the order neither kept the date nor got scheduled).
 */
export function routeCreateOrderDate(
    customCreatedAt: string | null | undefined,
    now: number = Date.now(),
): { createdAt: string | null; scheduledDate: string | null } {
    if (!customCreatedAt || Number.isNaN(Date.parse(customCreatedAt))) {
        return { createdAt: null, scheduledDate: null };
    }
    if (isFutureInstant(customCreatedAt, now)) {
        return { createdAt: null, scheduledDate: toBaghdadDayKey(customCreatedAt) };
    }
    return { createdAt: customCreatedAt, scheduledDate: null };
}
