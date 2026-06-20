"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem } from "@scheniders/shared";

interface CartState {
  items: CartItem[];
  /** Shipping R2b: the governorate the checkout form selected, so the order
   *  summary (a separate section) can show the SAME per-governorate fee. */
  governorate: string | null;
  setGovernorate: (code: string | null) => void;
  /** Discount engine: applied coupon code, shared cart→checkout (validated +
   *  priced server-side; the client only previews it). */
  couponCode: string | null;
  setCouponCode: (code: string | null) => void;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, qty: number) => void;
  /** EC24: correct a line's unit price after the server reports a reprice. */
  updatePrice: (productId: string, variantId: string | null, price: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

/**
 * Per-tenant cart key (EC22). The storefront is path-based — `/s/tenant-a` and
 * `/s/tenant-b` share one origin, so a single global `scheniders-cart` key let
 * tenant B's reload show tenant A's cart (cross-tenant COD line items). We
 * namespace the key by the `/s/<tenant>` segment so each store gets its own
 * bucket. Custom-domain stores have no `/s/<tenant>` segment and are already
 * isolated by hostname → they keep the base key. Pure + path-injected so it's
 * unit-testable without a DOM.
 */
export function cartKeyFor(baseName: string, pathname: string): string {
  const m = pathname.match(/^\/s\/([^/]+)/);
  return m ? `${baseName}:${decodeURIComponent(m[1])}` : baseName;
}

/**
 * Server-safe storage adapter. When `cart-store` is imported during SSR
 * (which happens because some sections that use it are bundled into pages
 * that may render on the server before "use client" hydration), accessing
 * `localStorage` throws. This adapter no-ops on the server and, in the
 * browser, namespaces every key by tenant (EC22) before deferring to the real
 * `localStorage`. The key is re-derived from the CURRENT path on each call, so
 * navigating between tenants reads/writes the right bucket.
 */
const serverSafeStorage = createJSONStorage<CartState>(() => {
  if (typeof window === "undefined") {
    // Stub matching the StateStorage interface — never called server-side
    // because `persist` only reads on hydrate (which is client-only).
    const memory: Record<string, string> = {};
    return {
      getItem: (k: string) => memory[k] ?? null,
      setItem: (k: string, v: string) => {
        memory[k] = v;
      },
      removeItem: (k: string) => {
        delete memory[k];
      },
    };
  }
  return {
    getItem: (k: string) =>
      window.localStorage.getItem(cartKeyFor(k, window.location.pathname)),
    setItem: (k: string, v: string) =>
      window.localStorage.setItem(cartKeyFor(k, window.location.pathname), v),
    removeItem: (k: string) =>
      window.localStorage.removeItem(cartKeyFor(k, window.location.pathname)),
  };
});

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      governorate: null,
      setGovernorate: (code) => set({ governorate: code }),
      couponCode: null,
      setCouponCode: (code) => set({ couponCode: code }),
      addItem: (item) =>
        set((state) => {
          const existing = state.items.find(
            (i) => i.product_id === item.product_id && i.variant_id === item.variant_id,
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i === existing ? { ...i, quantity: i.quantity + item.quantity } : i,
              ),
            };
          }
          return { items: [...state.items, item] };
        }),
      removeItem: (productId, variantId) =>
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.product_id === productId && i.variant_id === variantId),
          ),
        })),
      updateQuantity: (productId, variantId, qty) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              i.product_id === productId && i.variant_id === variantId
                ? { ...i, quantity: Math.max(0, qty) }
                : i,
            )
            .filter((i) => i.quantity > 0),
        })),
      updatePrice: (productId, variantId, price) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.product_id === productId && i.variant_id === variantId
              ? { ...i, price: Math.max(0, Math.round(price)) }
              : i,
          ),
        })),
      clearCart: () => set({ items: [] }),
      getTotal: () =>
        get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      getItemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "scheniders-cart",
      storage: serverSafeStorage,
      // Cart is per-storefront subdomain — browser already isolates by hostname.
      //
      // skipHydration: the store starts EMPTY on both the server and the first
      // client render, so cart-rendering sections (cart_summary, line items,
      // checkout, sticky bar…) match between SSR and hydration — no mismatch.
      // The persisted cart is loaded from localStorage after mount by the
      // <CartHydrator> mounted in the storefront layout, which calls
      // `useCart.persist.rehydrate()`.
      skipHydration: true,
    },
  ),
);
