/** The stock columns the storefront needs to decide what it shows as available. */
export interface StockColumns {
  stock_quantity: number | null;
  reserved_quantity: number | null;
  storefront_stock: number | null;
  storefront_sold_out: boolean | null;
}

/**
 * Units shown when the real count is 0 or below. The store never closes a
 * product by itself — the real count is often behind (items sell in the shop
 * and stock is not always updated), so a product stays orderable until the
 * merchant marks it out of stock. Well above every "only N left" threshold,
 * so no urgency label appears for it.
 */
export const KEEP_SELLING_UNITS = 999;

/**
 * Units the storefront shows and sells against. In order: the merchant's
 * out-of-stock switch (0), a merchant-set `products.storefront_stock`, the
 * real stock minus what open orders have reserved while that is above zero,
 * otherwise KEEP_SELLING_UNITS. The real columns stay the platform's
 * inventory either way — nothing here writes them.
 */
export function storefrontAvailable(p: StockColumns): number {
  if (p.storefront_sold_out) return 0;
  if (p.storefront_stock != null) return p.storefront_stock;
  const real = (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0);
  return real > 0 ? real : KEEP_SELLING_UNITS;
}

/**
 * A product row as every storefront section should see it: the available
 * units above become the stock on hand with nothing reserved, so the
 * sections' own `stock_quantity - reserved_quantity` lands on it.
 */
export function withStorefrontStock<T extends StockColumns>(p: T): T {
  const units = storefrontAvailable(p);
  const real = (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0);
  return units === real && p.reserved_quantity === 0 ? p : { ...p, stock_quantity: units, reserved_quantity: 0 };
}

/** A variant row: never closed by the real count (the merchant closes the whole product). */
export function withKeepSellingVariant<T extends { stock_quantity?: number | null; reserved_quantity?: number | null }>(v: T): T {
  const real = (v.stock_quantity ?? 0) - (v.reserved_quantity ?? 0);
  return real > 0 ? v : { ...v, stock_quantity: KEEP_SELLING_UNITS, reserved_quantity: 0 };
}
