/**
 * A refund order (RTN, `is_return`) moves the other way: the courier takes
 * cash to the customer and brings the item back. Its statuses are the
 * ordinary ones, but read as a refund: "In Transit" alone has misled staff
 * into treating it as an outbound delivery. A refund order the courier could
 * not complete is marked `rejected` (older rows) or `refund_failed`; both
 * read as failed. Any other status reads as a sale's does.
 *
 * The merchant app's orders (apps/platform/lib/order-status-labels.ts) and
 * the staff console's shop page both say these words, so a merchant and the
 * staff member on the phone with them name a refund the same way. Round 20
 * of the console audit found them typed in both apps.
 */
export const REFUND_ORDER_WORDS = {
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
} as const;

/** The statuses a refund order has its own words for. */
export type RefundOrderStatus = keyof (typeof REFUND_ORDER_WORDS)["en"];
