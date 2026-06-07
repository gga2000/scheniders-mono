"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/cart-store";

/**
 * The cart store is persisted with `skipHydration`, so it starts empty on both
 * the server and the first client render (no hydration mismatch in cart-derived
 * sections). This component triggers the one-time rehydrate from localStorage
 * after mount, populating the cart post-hydration.
 *
 * Mounted once in the storefront layout so it runs on every page — V2 and the
 * legacy template fallback alike.
 */
export function CartHydrator() {
  useEffect(() => {
    void useCart.persist.rehydrate();
  }, []);
  return null;
}
