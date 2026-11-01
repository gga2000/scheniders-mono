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
        in_transit: "In transit",
        rejected: "Rejected",
        delivered: "Delivered",
        completed: "Completed",
        no_response: "No response",
        return_pending: "Return pending",
        suspended: "Suspended",
        // `pending_checkout` is an abandoned cart, not a checkout in progress —
        // one of the two English spellings said the opposite of the other.
        pending_checkout: "Abandoned",
        refund_delivered: "Refund delivered",
        refund_failed: "Refund failed",
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

const NEUTRAL_TONE = "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-300";

/**
 * The pill colour for an order status on the customer drawer and the customer
 * profile, so the same order reads the same in both. Every tone has a dark
 * variant. Delivered outcomes are teal/green, failures rose, returns fuchsia,
 * in-flight states orange/amber/sky/blue, no response a lighter rose and cancelled
 * neutral. The customers pages' outcome flags and score events wear these same
 * tones (statusFlags, trustEventTone). The Orders page does not read this map.
 */
export const ORDER_STATUS_TONE: Record<OrderStatusKey, string> = {
    new: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200",
    contacted: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
    // Confirmed is still open (the banner draws it as a blue "open" pip): sky, never the delivered greens.
    confirmed: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
    in_transit: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
    delivered: "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200",
    completed: "bg-emerald-200 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100",
    rejected: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
    // A refusal like rejected (the engine counts it as severe), one step lighter so the two stay apart.
    no_response: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
    cancelled: NEUTRAL_TONE,
    return_pending: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-200",
    refund_delivered: "bg-pink-200 text-pink-900 dark:bg-pink-500/15 dark:text-pink-200",
    refund_failed: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
    suspended: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200",
    pending_checkout: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-200",
};

export function orderStatusTone(status: string | null | undefined): string {
    const key = status?.toLowerCase();
    return key && key in ORDER_STATUS_TONE ? ORDER_STATUS_TONE[key as OrderStatusKey] : NEUTRAL_TONE;
}

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
