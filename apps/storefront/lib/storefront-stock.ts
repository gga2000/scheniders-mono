/** The stock columns the storefront needs to decide what it shows as available. */
export interface StockColumns {
  stock_quantity: number | null;
  reserved_quantity: number | null;
  storefront_stock: number | null;
}

/**
 * Units the storefront shows and sells against. A merchant-set
 * `products.storefront_stock` replaces the real count; otherwise it is the
 * real stock minus what open orders have reserved. The real columns stay the
 * platform's inventory either way — nothing here writes them.
 */
export function storefrontAvailable(p: StockColumns): number {
  return p.storefront_stock ?? (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0);
}

/**
 * A product row as every storefront section should see it: when the merchant
 * set a storefront stock, it becomes the stock on hand with nothing reserved,
 * so the sections' own `stock_quantity - reserved_quantity` lands on it.
 */
export function withStorefrontStock<T extends StockColumns>(p: T): T {
  return p.storefront_stock == null ? p : { ...p, stock_quantity: p.storefront_stock, reserved_quantity: 0 };
}
