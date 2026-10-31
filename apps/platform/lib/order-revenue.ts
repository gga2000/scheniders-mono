/**
 * Realized revenue: one definition, bucketed on the day the money was actually
 * earned.
 *
 * COR-4. Three separate problems lived here.
 *
 * 1. Revenue was bucketed by `created_at`. An order created yesterday and
 *    delivered today counted towards yesterday. Measured against live data over
 *    30 days, **23.3% of revenue landed on the wrong day** (259,500 of
 *    1,113,750 IQD misattributed) — the period total was right, every daily
 *    figure a merchant reads was not.
 *
 * 2. `todayRevenue` and `totalRevenue` counted only `delivered`, while the
 *    profit engine counted `delivered` and `completed`. Since orders move on to
 *    `completed` (3,326 delivered → completed in six months), the stats
 *    understated revenue and the two engines disagreed.
 *
 * 3. `revenueTrends` additionally counted `confirmed` — an order that has not
 *    shipped, let alone been paid for — as revenue.
 *
 * Merchant days are Baghdad days (UTC+3, no DST), which is why bucketing goes
 * through the offset in lib/order-window rather than the viewer's local clock.
 */

import type { Order } from "@/types/order";
import { BAGHDAD_UTC_OFFSET_HOURS } from "@/lib/order-window";

/**
 * Statuses where the goods reached the customer and the money is real.
 *
 * `confirmed` and `in_transit` are deliberately absent: those are pipeline, not
 * revenue. This is the single definition — stats and the profit engine both
 * read it so they cannot drift apart again.
 */
export const REALIZED_REVENUE_STATUSES: readonly Order["status"][] = ["delivered", "completed"];

/**
 * Statuses that never became a sale: the customer refused, cancelled or never
 * answered, or the checkout was abandoned. Their price is not revenue and they
 * are not orders sold.
 */
export const NON_SALE_STATUSES: readonly Order["status"][] = ["rejected", "cancelled", "no_response", "pending_checkout"];

/** Whether an order counts as a sale: not a non-sale status and not a refund/return row. */
export function isSaleOrder(order: Pick<Order, "status" | "is_return">): boolean {
    if (order.is_return) return false;
    if (order.status === "refund_delivered" || order.status === "refund_failed" || order.status === "return_pending") return false;
    return !NON_SALE_STATUSES.includes(order.status);
}

/** Whether an order's price counts as earned. Returns never do. */
export function isRealizedRevenue(order: Pick<Order, "status" | "is_return">): boolean {
    return REALIZED_REVENUE_STATUSES.includes(order.status) && !order.is_return;
}

/**
 * The instant an order's revenue was realized.
 *
 * `delivered_at` is the moment of delivery. `completed_at` is a fallback for
 * rows that reached `completed` without a recorded delivery. Returns null when
 * neither is present, so such an order is counted in totals but not attributed
 * to any particular day — better than silently attributing it to the wrong one.
 */
export function realizedAt(
    order: Pick<Order, "delivered_at" | "completed_at">,
): string | null {
    return order.delivered_at ?? order.completed_at ?? null;
}

/**
 * The Baghdad calendar day (YYYY-MM-DD) an instant falls in.
 *
 * Iraq is UTC+3 year round, so shifting the instant by the offset and reading
 * the UTC date gives the merchant's day without needing a timezone database.
 */
export function baghdadDayKey(instant: string | Date): string | null {
    const ms = instant instanceof Date ? instant.getTime() : Date.parse(instant);
    if (Number.isNaN(ms)) return null;
    return new Date(ms + BAGHDAD_UTC_OFFSET_HOURS * 3600_000).toISOString().slice(0, 10);
}

/** Today's Baghdad calendar day. */
export function todayBaghdadDayKey(now: Date = new Date()): string {
    return baghdadDayKey(now) as string;
}

/** Total realized revenue across the given orders. */
export function sumRealizedRevenue(orders: readonly Order[]): number {
    return orders.reduce(
        (sum, order) => (isRealizedRevenue(order) ? sum + (Number(order.price) || 0) : sum),
        0,
    );
}

/**
 * Realized revenue for one Baghdad day, bucketed on when it was earned rather
 * than when the order was created.
 */
export function sumRealizedRevenueForDay(orders: readonly Order[], dayKey: string): number {
    return orders.reduce((sum, order) => {
        if (!isRealizedRevenue(order)) return sum;
        const at = realizedAt(order);
        if (!at || baghdadDayKey(at) !== dayKey) return sum;
        return sum + (Number(order.price) || 0);
    }, 0);
}

/** Count of orders whose revenue was realized on one Baghdad day. */
export function countRealizedForDay(orders: readonly Order[], dayKey: string): number {
    return orders.reduce((n, order) => {
        if (!isRealizedRevenue(order)) return n;
        const at = realizedAt(order);
        return at && baghdadDayKey(at) === dayKey ? n + 1 : n;
    }, 0);
}

/** The last `days` Baghdad day keys, oldest first, ending today. */
export function recentBaghdadDayKeys(days: number, now: Date = new Date()): string[] {
    const keys: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
        keys.push(baghdadDayKey(new Date(now.getTime() - i * 86_400_000)) as string);
    }
    return keys;
}
