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

/** Duplicate-detection windows, mirrored by public.get_order_duplicate_flags. */
export const PHONE_WINDOW_HOURS = 72;
export const PRODUCT_WINDOW_DAYS = 7;

type DuplicateCandidate = Pick<Order, "id" | "phone" | "created_at" | "is_return" | "items">;

const itemNamesOf = (o: Pick<Order, "items">): string[] =>
    (o.items ?? []).map(i => i.name?.toLowerCase()).filter(Boolean) as string[];

/**
 * Orders that look like duplicates of `target`.
 *
 * A candidate qualifies when it is a different, non-return order sharing the
 * normalized phone, AND either falls within ±72 hours, or falls within ±7 days
 * while sharing an item name (either name containing the other).
 *
 * Mirrored in SQL by `public.get_order_duplicate_flags`.
 */
export function findOrderDuplicates(
    target: DuplicateCandidate,
    candidates: DuplicateCandidate[],
): DuplicateCandidate[] {
    const targetPhone = normalizePhoneForSearch(target.phone);
    const targetItems = itemNamesOf(target);
    const at = new Date(target.created_at).getTime();
    const phoneWindow = PHONE_WINDOW_HOURS * 60 * 60 * 1000;
    const productWindow = PRODUCT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    return candidates.filter((o) => {
        if (o.id === target.id || o.is_return) return false;
        if (normalizePhoneForSearch(o.phone) !== targetPhone) return false;

        const delta = Math.abs(new Date(o.created_at).getTime() - at);
        if (delta <= phoneWindow) return true;

        if (delta <= productWindow && targetItems.length > 0) {
            const others = itemNamesOf(o);
            return targetItems.some(t => others.some(other => other.includes(t) || t.includes(other)));
        }
        return false;
    });
}

/**
 * The most recent OTHER non-return order for the same customer — the one the
 * card offers to merge with. Null for return orders, matching the client's
 * long-standing behaviour (it may be NEWER than the target).
 */
export function findPreviousOrderForCustomer<T extends Pick<Order, "id" | "phone" | "created_at" | "is_return">>(
    target: Pick<Order, "id" | "phone" | "is_return">,
    candidates: T[],
): T | null {
    if (target.is_return) return null;
    const targetPhone = normalizePhoneForSearch(target.phone);
    return (
        candidates
            .filter(o => o.id !== target.id && !o.is_return && normalizePhoneForSearch(o.phone) === targetPhone)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null
    );
}
