/**
 * Section-system types.
 *
 * The package was extracted from `apps/storefront/sections/` where it
 * referenced `apps/storefront/lib/types.ts` directly. To stay app-agnostic
 * (so the platform's Builder v2 can render sections inline), we anchor
 * onto the BASE types in `@scheniders/shared` and additively declare the
 * fields that sections actually read. Storefront- or platform-only fields
 * stay optional so neither app has to lie about its data shape.
 */

import type {
  BaseTenant,
  BaseProduct,
  BaseProductVariant,
  Category,
} from "@scheniders/shared";

export type { Category } from "@scheniders/shared";

/** Tenant as sections see it. Sections don't reach into store_config — it's
 * available to consumers but never read in any built-in section render. */
export type Tenant = BaseTenant;

/** Product as sections see it. Storefront-only fields are optional and
 * additive (slug, category_id, display_order, images, etc.) — the storefront
 * Product extends BaseProduct with the same fields. */
export interface Product extends BaseProduct {
  slug?: string | null;
  is_visible?: boolean;
  category_id?: string | null;
  display_order?: number;
  images?: string[];
  /** Short marketing line (per-product promo notice on the funnel PDP). */
  short_description?: string | null;
  /** Ordered gallery photo URLs (products.gallery_urls jsonb, coerced to a
   *  clean string[] by the consuming app before it reaches sections). */
  gallery_urls?: string[];
  /** Per-product feature cards (note highlights) — hidden when absent. */
  feature_cards?: { image_url?: string; title: string; body: string }[];
  /** Optional ISO date — used for "newest" sort fallbacks + the "New" card badge. */
  created_at?: string;
  /** Optional merchandising flag — drives the "Bestseller" card badge when set. */
  is_bestseller?: boolean;
  /** Optional variant list — populated on the PDP. */
  variants?: ProductVariant[];
  /** Approved-review aggregates (real data, storefront-populated). Sections
   *  must hide rating UI entirely when these are absent or zero — never
   *  fabricate a rating. */
  review_count?: number;
  avg_rating?: number;
}

export interface ProductVariant extends BaseProductVariant {
  /** Variants always carry a concrete price when rendered. */
  price: number;
}
