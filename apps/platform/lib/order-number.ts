import { z } from "zod";

/**
 * Order numbers the database generates (create_order_atomic →
 * next_order_number): source digit 1-4, YYMMDD, then a counter of at least
 * three digits — e.g. 4261020007. Only the server may hand one out; a caller
 * that picks one could take tomorrow's numbers from every other tenant
 * (orders_order_id_key is global).
 */
const SYSTEM_ORDER_NUMBER = /^[1-4]\d{9,}$/;

export function isSystemOrderNumber(value: string): boolean {
    return SYSTEM_ORDER_NUMBER.test(value.trim());
}

/**
 * True for a generator-format number dated before `now`'s UTC day (the
 * database's current_date). The counter only hands out numbers for today, so
 * an earlier day's number can be restored without taking one from any tenant.
 */
export function isPastDaySystemOrderNumber(value: string, now: Date = new Date()): boolean {
    const trimmed = value.trim();
    if (!isSystemOrderNumber(trimmed)) return false;
    const today = now.toISOString().slice(2, 10).replace(/-/g, "");
    return trimmed.slice(1, 7) < today;
}

/** A number a merchant may type for an order (the order-number edit). */
export const merchantOrderNumberSchema = z
    .string()
    .trim()
    .min(1, "Order number is required")
    .max(64, "Order number is too long")
    .refine((v) => !isSystemOrderNumber(v), {
        message: "Numbers in the automatic format are assigned by the system — choose a different number",
    });
