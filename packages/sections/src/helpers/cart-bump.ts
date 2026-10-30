"use client";

// The header's cart badge pops briefly when the shopper adds something.
// A rise in the count is an add only when the cart had already loaded at
// the count before it: the persisted cart arriving after mount (CartHydrator)
// and a header remounting on navigation are not adds, so neither pops.
// Any later change settles a pop at once (the cleanup): a fall — a direct
// order retiring the line — leaves it settled, and another add re-pops it
// for a full CART_BUMP_MS.

import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-store";

/** How long the badge stays popped. */
export const CART_BUMP_MS = 300;

export function useCartBump(): boolean {
  const count = useCart((s) => s.getItemCount());
  const [bumped, setBumped] = useState(false);
  const prev = useRef({ count, loaded: useCart.persist.hasHydrated() });
  useEffect(() => {
    const was = prev.current;
    prev.current = { count, loaded: useCart.persist.hasHydrated() };
    if (!was.loaded || count <= was.count) return;
    setBumped(true);
    const handle = setTimeout(() => setBumped(false), CART_BUMP_MS);
    return () => {
      clearTimeout(handle);
      setBumped(false);
    };
  }, [count]);
  return bumped;
}
