// =====================================================================
// Is this line orderable, and at what catalogue unit price?
// =====================================================================
// One rule for every server path that turns a { product_id, variant_id }
// line into something stored: the checkout (which charges it) and the
// phone-capture endpoint (which files it as a lead). Both read the rows
// themselves, tenant-scoped; this only decides.
//
// A line is not orderable when its product is missing, archived, not
// "active" (the merchant's Draft/Archived choice), hidden, or a supply item;
// when it names a variant that is missing, belongs to another product, or is
// switched off; when it names no variant for a product sold by variant
// (lib/variant-products); or when the price it resolves to is not positive.
// The unit price is the variant's, else the product's website price, else
// its base price. Quantity breaks and bumps are order-level and are applied
// after this (priceOrderLines).
// =====================================================================

export interface CatalogueProduct {
  status: string;
  is_visible: boolean;
  is_archived: boolean | null;
  is_supply: boolean;
  price: number;
  website_price: number | null;
}

export interface CatalogueVariant {
  product_id: string;
  price: number | null;
  is_enabled: boolean | null;
}

export interface CatalogueLineRef {
  product_id: string;
  variant_id?: string | null;
}

/** The line's catalogue unit price, or null when it is not orderable. */
export function catalogueUnitPrice(
  line: CatalogueLineRef,
  product: CatalogueProduct | undefined,
  variants: ReadonlyMap<string, CatalogueVariant>,
  soldByVariant: ReadonlySet<string>,
): number | null {
  if (
    !product ||
    product.is_archived ||
    product.status !== "active" ||
    !product.is_visible ||
    product.is_supply
  ) {
    return null;
  }
  let unitPrice: number;
  if (line.variant_id) {
    const variant = variants.get(line.variant_id);
    if (!variant || variant.product_id !== line.product_id || variant.is_enabled === false) {
      return null;
    }
    unitPrice = Number(variant.price ?? product.website_price ?? product.price) || 0;
  } else {
    // No variant named for a product sold by variant: no size for the
    // courier and no price the merchant set — and a variant priced above
    // the parent would otherwise be bought at the parent's price.
    if (soldByVariant.has(line.product_id)) return null;
    unitPrice = Number(product.website_price ?? product.price) || 0;
  }
  if (unitPrice <= 0 || !Number.isFinite(unitPrice)) return null;
  return unitPrice;
}
