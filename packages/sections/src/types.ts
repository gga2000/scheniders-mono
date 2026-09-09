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
  ResolvedProductAttribute,
  BaseProductVariant,
  Category,
  ProductReview,
  StoreConfigV2,
} from "@scheniders/shared";

export type { Category } from "@scheniders/shared";

/** Contact numbers a section may read off the tenant's legacy
 *  `store_config` (the universal WhatsApp/phone set in the store builder). */
export interface SectionTenantContact {
  whatsapp_number?: string | null;
  phone_number?: string | null;
}

/**
 * Tenant as sections see it: `BaseTenant` plus the two config slices a
 * built-in section (or a helper it calls) actually reads. This is the
 * shape `toSectionTenant()` produces — the storefront prunes its full
 * tenant row to it before handing it to `RenderPage`, so nothing beyond
 * these fields is serialised into the RSC payload for client sections.
 * See `helpers/section-tenant.ts` for the field-by-field reader list.
 */
export interface SectionTenant extends BaseTenant {
  store_config?: { contact?: SectionTenantContact | null } | null;
  store_config_v2?: Pick<StoreConfigV2, "commerce" | "enabled_locales"> | null;
}

export type Tenant = SectionTenant;

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
  /** 1 = the tenant's best seller over the trailing 180 days of fulfilled
   *  orders, NULL/absent = outside the top 20. Computed in the database
   *  (`refresh_bestseller_ranks()`), never edited by hand — the storefront
   *  only reads the ordinal, never the underlying unit volumes. */
  bestseller_rank?: number | null;
  /** Merchant-defined attributes, already paired with their definitions and
   *  ordered by the merchant's `display_order`. Populated where a section
   *  needs them (the PDP today); absent elsewhere, and sections must render
   *  nothing rather than a placeholder when the list is empty. */
  attributes?: ResolvedProductAttribute[];
  /** Optional variant list — populated on the PDP. */
  variants?: ProductVariant[];
  /** Approved-review aggregates (real data, storefront-populated). Sections
   *  must hide rating UI entirely when these are absent or zero — never
   *  fabricate a rating. */
  review_count?: number;
  avg_rating?: number;
  /** APPROVED reviews resolved server-side by the product page (newest
   *  first, capped) so the reviews section paints its list in the SSR HTML.
   *  Absent on pages that don't preload them — sections fall back to a
   *  client fetch. */
  reviews?: ReviewSummaryItem[];
}

/** One approved review as the storefront preloads it into `Product.reviews`:
 *  exactly the columns `/api/reviews` GET returns (no moderation status —
 *  only approved rows ever reach this list). */
export type ReviewSummaryItem = Pick<
  ProductReview,
  | "id"
  | "product_id"
  | "rating"
  | "title"
  | "body"
  | "author_name"
  | "photo_urls"
  | "created_at"
>;

export interface ProductVariant extends BaseProductVariant {
  /** Variants always carry a concrete price when rendered. */
  price: number;
}
