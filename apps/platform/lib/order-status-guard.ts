/**
 * A delivered order that has an exchange or return cannot be moved to
 * rejected, cancelled or no answer: `orders_guard_exchanged_original_status`
 * raises SQLSTATE 23514. The customer paid and kept an item, so the outcome
 * belongs on the exchange or return order. These helpers recognise that
 * refusal so it is shown as a plain answer instead of a retried failure.
 */

/** Matches the trigger's own message, so an unrelated check violation is not mistaken for it. */
const EXCHANGED_ORIGINAL_MESSAGE = "has an exchange or return";

export class ExchangedOrderStatusError extends Error {
    constructor() {
        super("This order was delivered and has an exchange or return. Keep it delivered and record the outcome on the exchange or return order.");
        this.name = "ExchangedOrderStatusError";
    }
}

/** Whether a Supabase/PostgREST error is the exchange guard refusing a status change. */
export function isExchangedOriginalStatusViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const { code, message } = error as { code?: unknown; message?: unknown };
    return code === "23514" && typeof message === "string" && message.includes(EXCHANGED_ORIGINAL_MESSAGE);
}
