// =====================================================================
// Abandoned-cart recovery — shared types + cart math
// =====================================================================
// The storefront captures a cart (phone + items) at checkout; a later job
// nudges the customer over WhatsApp. These helpers are the single source of
// truth for cart totals shared by the capture endpoint and the reminder sender.
// =====================================================================

export interface AbandonedCartItem {
  product_id: string;
  variant_id?: string | null;
  name: string;
  quantity: number;
  /** Unit price in IQD. */
  price: number;
}

/** Line-item subtotal (IQD). Negative price/quantity are floored to 0. */
export function cartItemsSubtotal(
  items: ReadonlyArray<{ price: number; quantity: number }>,
): number {
  return items.reduce(
    (sum, i) => sum + Math.max(0, i.price) * Math.max(0, Math.floor(i.quantity)),
    0,
  );
}

/** Total units across the cart. */
export function cartItemCount(
  items: ReadonlyArray<{ quantity: number }>,
): number {
  return items.reduce((n, i) => n + Math.max(0, Math.floor(i.quantity)), 0);
}
