import type { CartItem } from "@scheniders/shared";
import type { Product } from "@/lib/types";

// Kept out of the "use client" component: the preview route is a server
// component, and a function exported from a client module cannot be called
// on the server (React error 441 in production builds).
/** One unit of each product, priced the way a quick add would price it. */
export function sampleCartLines(products: readonly Product[]): CartItem[] {
  return products.map((p) => ({
    product_id: p.id,
    variant_id: null,
    name: p.name,
    variant_name: null,
    price: p.price,
    quantity: 1,
    image_url: p.image_url ?? null,
    base_price: p.price,
    ...(p.price_tiers ? { price_tiers: p.price_tiers } : {}),
  }));
}
