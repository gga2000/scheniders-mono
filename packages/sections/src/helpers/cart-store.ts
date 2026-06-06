"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem } from "@scheniders/shared";

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  updateQuantity: (productId: string, variantId: string | null, qty: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

/**
 * Server-safe storage adapter. When `cart-store` is imported during SSR
 * (which happens because some sections that use it are bundled into pages
 * that may render on the server before "use client" hydration), accessing
 * `localStorage` throws. This adapter no-ops on the server and defers to
 * the real `localStorage` once we're in a browser.
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
  return window.localStorage;
});

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
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
