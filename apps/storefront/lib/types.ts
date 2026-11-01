/**
 * Storefront-facing types.
 * Base types come from @scheniders/shared; storefront extends them.
 */

import type { BaseTenant, BaseProduct, BaseProductVariant, StoreConfig, StoreConfigV2, PriceTier, OrderBumpOffer, ResolvedProductAttribute } from "@scheniders/shared";

// Re-export shared types used directly
export type { Category, CartItem, CheckoutFormData } from "@scheniders/shared";
export type { TenantBranding, TenantSettings, TenantStatus } from "@scheniders/shared";
export type { TemplateName, StoreConfig, DesignTokens, SectionConfig, SEOConfig, HeroConfig, AboutConfig, ContactConfig } from "@scheniders/shared";

/** The storefront never loads the tenant's plan or internal settings (costs,
 *  integrations): they are not public, so the row it reads omits them. */
export interface Tenant extends Omit<BaseTenant, "plan" | "settings"> {
  store_config?: StoreConfig | null;
  store_config_v2?: StoreConfigV2 | null;
  store_config_v2_draft?: StoreConfigV2 | null;
  address?: string | null;
  /** Set to true ONLY by `withDraftView` (lib/tenant.ts) when this request
   *  holds a valid draft-view preview token for the tenant. Not a DB column:
   *  public loaders never set it. The render uses it to skip the merchant's
   *  production ad pixels for their own preview traffic. */
  is_draft_view?: boolean;
}

export interface Product extends BaseProduct {
  /** Quantity price breaks (product_tiered_pricing). Populated on the PDP. */
  price_tiers?: PriceTier[];
  /** True when the product has enabled variants, so it must be bought as one
   *  (see `withVariantFlags`). Absent means not sold by variant. */
  sold_by_variant?: boolean;
  /** Add-on offers (product_order_bumps). Populated on the PDP. */
  order_bumps?: OrderBumpOffer[];
  /** Products the offers point at, resolved with them. */
  order_bump_products?: Product[];
  /** Merchant-defined attributes, resolved against the tenant's taxonomy.
   *  Populated on the PDP; see `withAttributes` in lib/queries.ts. */
  attributes?: ResolvedProductAttribute[];
  tenant_id: string;
  description: string | null;
  compare_at_price: number | null;
  image_url: string | null;
  sku: string | null;
  // Storefront-only fields
  slug?: string | null;
  is_visible?: boolean;
  category_id?: string | null;
  display_order?: number;
  images?: string[];
  /** Ordered gallery photo URLs from products.gallery_urls (jsonb, coerced to
   *  a clean string[] by lib/queries — never trust raw jsonb shape). */
  gallery_urls?: string[];
  /** Per-product feature cards (products.feature_cards jsonb, coerced to
   *  well-shaped entries). Rendered as note-highlight cards on the PDP. */
  feature_cards?: { image_url?: string; title: string; body: string }[];
  /** Merchant-entered public identity shown on the PDP (null = hidden). */
  brand?: string | null;
  display_name?: string | null;
  size_ml?: number | null;
  gender?: "men" | "women" | "unisex" | null;
  /** Approved-review aggregates, merged in by lib/queries (real data only). */
  review_count?: number;
  avg_rating?: number;
}

export interface ProductVariant extends BaseProductVariant {
  tenant_id: string;
  price: number;
  sku: string | null;
}
