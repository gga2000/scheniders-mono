/**
 * Single source of truth for order money on the courier side.
 *
 * CANONICAL CONVENTION (verified against live data on 2026-08-22):
 *   `orders.price`        = line-item subtotal with the discount ALREADY applied
 *                           (delivery is NOT included)
 *   `orders.delivery_fee` = delivery, tracked separately
 *   `orders.discount_amount` = record of the discount already deducted from `price`
 *
 * Therefore the amount a courier must collect is `price + delivery_fee`.
 *
 * Why this is written down: the codebase previously held three different
 * readings of `price`. The Prime CSV and Al-Waseet XLSX exports treated it as a
 * grand total and shipped it as the COD amount, so the delivery fee was never
 * collected; the Al-Waseet API subtracted `discount_amount` a second time even
 * though `price` already had it applied. Every courier-facing amount now comes
 * from this one function.
 */

type OrderMoneyFields = {
    price?: number | null;
    delivery_fee?: number | null;
    discount_amount?: number | null;
    payment_status?: string | null;
};

/** Payment states where the customer has already paid — courier collects nothing. */
function isPrepaid(paymentStatus?: string | null): boolean {
    return paymentStatus === "prepaid" || paymentStatus === "paid";
}

/**
 * Cash the courier collects on delivery, in whole IQD.
 * Returns 0 for prepaid orders.
 */
export function computeCodAmount(order: OrderMoneyFields): number {
    if (isPrepaid(order.payment_status)) return 0;

    const price = Number(order.price) || 0;
    const deliveryFee = Number(order.delivery_fee) || 0;

    // `price` is already net of the discount — subtracting `discount_amount`
    // here would deduct it twice.
    return Math.max(0, Math.round(price + deliveryFee));
}
