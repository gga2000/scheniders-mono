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
// can render its own inline choice only when no picker is on the page. A
// section registers only while it actually shows options: a registered picker
// that renders nothing would hide the inline choice and leave the shopper
// with no way to pick. Each picker marks its options with
// `variantPickerAnchor(productId)` so a buying section can send the shopper
// there (`focusVariantPicker`) when they try to buy without choosing.
//
// A product with variants is bought as one of them: the checkout refuses a
// variant-less line for it and prices the line from the variant row. So
// nothing is ever chosen on the shopper's behalf — not the first option, not
// the only one. A silently chosen size is the variant version of a silently
// chosen governorate. Every section reads `needsVariant` and refuses to sell
// until the shopper has picked.
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
  /** The one the shopper chose, or null until they choose. */
  variant: ProductVariant | null;
  /** True when the product is bought as one of its variants: it has some, or
   *  the catalogue flagged it (`sold_by_variant`) even if the list is absent. */
  soldByVariant: boolean;
  /** True while the product is sold by variant and none is chosen — the
   *  buying sections must not add or submit it in this state. */
  needsVariant: boolean;
  /** True when the product is sold by variant and none can be bought — every
   *  variant is out of stock, or the product has none to offer. The buying
   *  sections show it as sold out rather than asking for a choice that
   *  cannot be made. */
  soldOut: boolean;
  /** True when a picker section (pdp_variants, the buy box) is on the page
   *  for this product and showing its options. */
  pickerMounted: boolean;
  select: (variantId: string | null) => void;
}

/**
 * The shopper's choice for `product`. Never implicit: a product sold by
 * variant, even one with a single variant, waits for an explicit choice, and
 * the buying section asks for it.
 */
export function useSelectedVariant(product: Product | null | undefined): SelectedVariant {
  const productId = product?.id ?? "";
  const variants = sellableVariants(product);
  const chosenId = useVariantStore((s) => s.selected[productId] ?? null);
  const pickerMounted = useVariantStore((s) => (s.pickers[productId] ?? 0) > 0);
  const select = useVariantStore((s) => s.select);
  const variant = variants.find((v) => v.id === chosenId) ?? null;
  const soldByVariant = variants.length > 0 || product?.sold_by_variant === true;
  const soldOut =
    soldByVariant && (product == null || !variants.some((v) => stockLeftFor(product, v) > 0));
  return {
    variants,
    variant,
    soldByVariant,
    needsVariant: soldByVariant && variant === null,
    soldOut,
    pickerMounted,
    select: (variantId) => select(productId, variantId),
  };
}

/** Units left for a variant, or for the product when it has none. */
export function stockLeftFor(product: Product, variant: ProductVariant | null): number {
  if (variant) return (variant.stock_quantity ?? 0) - (variant.reserved_quantity ?? 0);
  return (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0);
}

/** Spread on the element that holds a picker's options, so a buying section
 *  can bring the shopper to it. */
export function variantPickerAnchor(productId: string): { "data-variant-picker": string } {
  return { "data-variant-picker": productId };
}

/** Scroll to the product's picker section and focus its first available
 *  option. Called by a buying section when the shopper tries to buy before
 *  choosing and the choice lives in another section. */
export function focusVariantPicker(productId: string): void {
  if (typeof document === "undefined") return;
  const anchor = Array.from(document.querySelectorAll<HTMLElement>("[data-variant-picker]")).find(
    (el) => el.dataset.variantPicker === productId,
  );
  if (!anchor) return;
  anchor.scrollIntoView?.({ block: "center" });
  anchor.querySelector<HTMLElement>("button:not(:disabled), select:not(:disabled)")?.focus();
}
