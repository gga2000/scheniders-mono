"use client";

import { useEffect } from "react";
import type { CartItem } from "@scheniders/shared";
import { useCart } from "@/lib/cart-store";
import type { Product } from "@/lib/types";

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

/**
 * Loads the editor preview's own cart (a separate bucket from the shopper's
 * real cart, see `cartKeyFor`) and, on the cart and checkout pages, fills an
 * empty one with sample lines so the merchant sees those pages as a shopper
 * with items would, instead of the empty-cart state.
 */
export function PreviewSampleCart({ sample }: { sample: CartItem[] }): null {
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(useCart.persist.rehydrate()).then(() => {
      if (cancelled || sample.length === 0) return;
      if (useCart.getState().items.length === 0) useCart.setState({ items: sample });
    });
    return () => {
      cancelled = true;
    };
  }, [sample]);
  return null;
}
