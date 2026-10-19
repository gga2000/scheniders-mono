// =====================================================================
// variant-store — which variant of a product the shopper chose
// =====================================================================
// The variant picker (pdp_variants), the direct-order form, the buy box
// and add-to-cart are separate sections rendered from config; none of them
// can pass props to another. This tiny store is the wire between them:
// the picker writes, the buying sections read. Keyed by product id so two
// products on one page (e.g. a bump) never share a choice. Not persisted —
// a choice belongs to this page view.
//
// `pickers` counts mounted picker sections per product, so a buying section
// can render its own inline choice only when no picker is on the page.
// =====================================================================

import { create } from "zustand";
import type { Product, ProductVariant } from "../types";

interface VariantState {
  selected: Record<string, string | null>;
  pickers: Record<string, number>;
  select: (productId: string, variantId: string | null) => void;
  registerPicker: (productId: string) => () => void;
}

export const useVariantStore = create<VariantState>()((set) => ({
  selected: {},
  pickers: {},
  select: (productId, variantId) =>
    set((s) => ({ selected: { ...s.selected, [productId]: variantId } })),
  registerPicker: (productId) => {
    set((s) => ({ pickers: { ...s.pickers, [productId]: (s.pickers[productId] ?? 0) + 1 } }));
    return () =>
      set((s) => ({ pickers: { ...s.pickers, [productId]: Math.max(0, (s.pickers[productId] ?? 1) - 1) } }));
  },
}));

/** Variants a shopper can actually pick: enabled, with a usable price. */
export function sellableVariants(product: Product | null | undefined): ProductVariant[] {
  return (product?.variants ?? []).filter((v) => v && typeof v.id === "string");
}

export interface SelectedVariant {
  /** Every variant of the product (empty for a plain product). */
  variants: ProductVariant[];
  /** The chosen one, or null when the product has variants and none is chosen. */
  variant: ProductVariant | null;
  /** True when a pdp_variants section is on the page for this product. */
  pickerMounted: boolean;
  select: (variantId: string | null) => void;
}

/**
 * The shopper's choice for `product`. A product with exactly one variant
 * needs no choosing — it is selected implicitly. A product with several
 * requires an explicit choice; the buying section asks for it.
 */
export function useSelectedVariant(product: Product | null | undefined): SelectedVariant {
  const productId = product?.id ?? "";
  const variants = sellableVariants(product);
  const chosenId = useVariantStore((s) => s.selected[productId] ?? null);
  const pickerMounted = useVariantStore((s) => (s.pickers[productId] ?? 0) > 0);
  const select = useVariantStore((s) => s.select);
  const variant =
    variants.length === 1
      ? variants[0]
      : (variants.find((v) => v.id === chosenId) ?? null);
  return {
    variants,
    variant,
    pickerMounted,
    select: (variantId) => select(productId, variantId),
  };
}

/** Units left for a variant, or for the product when it has none. */
export function stockLeftFor(product: Product, variant: ProductVariant | null): number {
  if (variant) return (variant.stock_quantity ?? 0) - (variant.reserved_quantity ?? 0);
  return (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0);
}
