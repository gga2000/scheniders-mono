import type { Order } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";

/**
 * Customer duplicate counting.
 *
 * Extracted from `hooks/use-order-auxiliary.ts` so the algorithm is a pure,
 * testable function rather than a `useMemo` body. PERF-1 moves this work to the
 * server (`get_customer_order_counts`), and the two implementations must agree
 * — a pure function is what makes that provable.
 */

/**
 * Collapse an order id to the identity its duplicates share.
 *
 * Mirrored in SQL by `public.order_base_id`. Behaviour, in order:
 *   `LF-<digits>-<digits>` at the END -> the first digit group
 *   a leading `DLV-`                  -> stripped (first occurrence only)
 *   otherwise                         -> the first run of digits
 *   no digits at all                  -> the id unchanged
 *   null / empty                      -> ''
 */
export function getOrderBaseId(orderId: string | undefined | null): string {
    if (!orderId) return '';
    const lfMatch = orderId.match(/LF-(\d+)-\d+$/);
    if (lfMatch) return lfMatch[1];
    if (orderId.startsWith('DLV-')) return orderId.replace('DLV-', '');
    const digits = orderId.match(/\d+/);
    return digits ? digits[0] : orderId;
}

/**
 * Orders per customer, keyed by normalized phone.
 *
 * Archived and return orders are skipped, and an order counts once per
 * (phone, base id) pair so a split/re-imported order is not counted twice.
 * Mirrored in SQL by `public.get_customer_order_counts`.
 */
export function computeCustomerOrderCounts(
    orders: Pick<Order, "phone" | "order_id" | "is_archived" | "is_return">[],
): Map<string, number> {
    const counts = new Map<string, number>();
    const seen = new Set<string>();

    for (const order of orders) {
        if (order.is_archived || order.is_return) continue;

        const normalizedPhone = normalizePhoneForSearch(order.phone);
        const dedupKey = `${normalizedPhone}-${getOrderBaseId(order.order_id)}`;

        if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            counts.set(normalizedPhone, (counts.get(normalizedPhone) || 0) + 1);
        }
    }

    return counts;
}
