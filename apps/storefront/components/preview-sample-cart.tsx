"use client";

import { useEffect } from "react";
import type { CartItem } from "@scheniders/shared";
import { useCart } from "@/lib/cart-store";

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
