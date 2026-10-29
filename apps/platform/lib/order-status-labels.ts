import type { Locale } from "@/lib/i18n";

/**
 * The single source of truth for how an order status is written for a human.
 *
 * ARCH-4: this table used to exist three times — `getStatusLabel` in lib/utils
 * carried a hardcoded Arabic copy, and lib/i18n carried two more under
 * `orders.status.*`, once camelCased and once snake_cased. They had already
 * drifted: `completed` read "طلب تام" on an order card and "مكتمل" on the filter
 * chip above it, `pending_checkout` read "سلة" / "متروكة" / "قيد الدفع" in three
 * places, and `refund_delivered` was simply missing from `getStatusLabel`, so 74
 * live orders rendered a raw snake_case string in an Arabic UI.
 *
 * Everything now derives from here: `getStatusLabel`, and the `orders.status.*`
 * translation keys, which are generated from this table rather than typed out.
 * Where the three copies disagreed the i18n wording won, because these keys are
 * what the filter chips are labelled with and what a merchant filters by.
 */
export const ORDER_STATUSES = [
    "new",
    "contacted",
    "confirmed",
    "cancelled",
    "in_transit",
    "rejected",
    "delivered",
    "completed",
    "no_response",
    "return_pending",
    "suspended",
    "pending_checkout",
    "refund_delivered",
    "refund_failed",
] as const;

export type OrderStatusKey = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<Locale, Record<OrderStatusKey, string>> = {
    en: {
        new: "New",
        contacted: "Contacted",
        confirmed: "Confirmed",
        cancelled: "Canceled",
        in_transit: "In Transit",
        rejected: "Rejected",
        delivered: "Delivered",
        completed: "Completed",
        no_response: "No Response",
        return_pending: "Return Pending",
        suspended: "Suspended",
        // `pending_checkout` is an abandoned cart, not a checkout in progress —
        // one of the two English spellings said the opposite of the other.
        pending_checkout: "Abandoned",
        refund_delivered: "Refund Delivered",
        refund_failed: "Refund Failed",
    },
    ar: {
        new: "جديد",
        contacted: "تم الاتصال",
        confirmed: "مؤكد",
        cancelled: "ملغي",
        in_transit: "قيد التوصيل",
        rejected: "مرفوض",
        delivered: "تم التوصيل",
        completed: "مكتمل",
        no_response: "لم يرد",
        return_pending: "قيد الاسترجاع",
        suspended: "معلق",
        pending_checkout: "متروكة",
        refund_delivered: "تم الاسترجاع",
        refund_failed: "فشل الاسترجاع",
    },
};

/**
 * A refund order (RTN) moves the other way: the courier takes cash to the
 * customer and brings the item back. Its statuses are the ordinary ones, but
 * read as a refund — "In Transit" alone has misled staff into treating it as
 * an outbound delivery. A refund order the courier could not complete is
 * marked `rejected` (older rows) or `refund_failed`; both read as failed.
 */
export const REFUND_ORDER_STATUS_LABELS: Record<Locale, Partial<Record<OrderStatusKey, string>>> = {
    en: {
        return_pending: "Pickup pending",
        in_transit: "Courier collecting",
        refund_delivered: "Refunded to customer",
        refund_failed: "Refund failed",
        rejected: "Refund failed",
    },
    ar: {
        return_pending: "بانتظار الاستلام",
        in_transit: "مع المندوب",
        refund_delivered: "تم إرجاع المبلغ",
        refund_failed: "فشل الاسترجاع",
        rejected: "فشل الاسترجاع",
    },
};

/** camelCase spelling of a status key, for the `orders.status.*` i18n keys. */
function camelCase(status: OrderStatusKey): string {
    return status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * The `orders.status.*` entries for one locale, generated from the table above.
 *
 * Both spellings are emitted — `orders.status.inTransit` and
 * `orders.status.in_transit` — because call sites use both, and generating them
 * is what makes it impossible for the two to say different things again.
 */
export function orderStatusTranslations(locale: Locale): Record<string, string> {
    const entries: Record<string, string> = {};
    for (const status of ORDER_STATUSES) {
        const label = ORDER_STATUS_LABELS[locale][status];
        entries[`orders.status.${status}`] = label;
        entries[`orders.status.${camelCase(status)}`] = label;
    }
    return entries;
}

/**
 * Human label for an order status.
 *
 * Falls back to the raw status rather than to another status: an unknown value
 * showing through is a visible bug report, whereas defaulting to "new" — which
 * an earlier version of this code did — silently mislabels the order.
 */
export function getOrderStatusLabel(
    status: string,
    locale: Locale,
    isReturn?: boolean,
): string {
    const refundLabel = isReturn ? REFUND_ORDER_STATUS_LABELS[locale][status as OrderStatusKey] : undefined;
    if (refundLabel) return refundLabel;
    const labels = ORDER_STATUS_LABELS[locale];
    return labels[status as OrderStatusKey] ?? status;
}
