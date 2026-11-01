// =====================================================================
// site_header — which categories the menu drawer lists, and with what
// =====================================================================
// Pure: the drawer is a client component, so the choice is made here,
// testable without a DOM.
//
// A category earns a row when the merchant marked it for the mobile drawer
// AND it currently has something to show. Its photo is the category's own
// image, else the first in-stock perfume in it, else the first perfume at
// all. Count and membership both come from `category_product_ids`, the
// same source the catalogue's chips use, so the drawer never advertises a
// number the category page then contradicts.
// =====================================================================

import type { Category, Product } from "./types";
import type { DrawerCategory } from "./site_header.drawer";

/** More rows than this and the list stops being a menu. */
export const DRAWER_CATEGORY_LIMIT = 6;

function inStock(p: Product): boolean {
  return (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0) > 0;
}

function firstImage(p: Product | undefined): string | null {
  if (!p) return null;
  return p.images?.find((src) => src.trim() !== "") ?? null;
}

export function buildDrawerCategories(
  categories: readonly Category[],
  products: readonly Product[],
  categoryProductIds: Record<string, string[]> | undefined,
): DrawerCategory[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return categories
    .filter((c) => c.show_in_mobile_drawer !== false)
    .map((c, order) => {
      const members = (categoryProductIds?.[c.id] ?? [])
        .map((id) => byId.get(id))
        .filter((p): p is Product => p !== undefined);
      const pick = members.find((p) => inStock(p) && firstImage(p)) ?? members.find((p) => firstImage(p));
      return {
        order,
        displayOrder: c.display_order ?? 0,
        row: {
          id: c.id,
          href: `/categories/${c.slug}`,
          label: c.name,
          count: members.length,
          image: c.image_url ?? firstImage(pick),
        },
      };
    })
    .filter((c) => c.row.count > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.order - b.order)
    .slice(0, DRAWER_CATEGORY_LIMIT)
    .map((c) => c.row);
}
