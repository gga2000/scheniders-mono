/**
 * Storefront-facing types.
 * Base types come from @scheniders/shared; storefront extends them.
 */

import type { BaseTenant, BaseProduct, BaseProductVariant, StoreConfig, StoreConfigV2 } from "@scheniders/shared";

// Re-export shared types used directly
export type { Category, CartItem, CheckoutFormData } from "@scheniders/shared";
export type { TenantBranding, TenantSettings, TenantStatus } from "@scheniders/shared";
export type { TemplateName, StoreConfig, DesignTokens, SectionConfig, SEOConfig, HeroConfig, AboutConfig, ContactConfig } from "@scheniders/shared";

export interface Tenant extends BaseTenant {
  store_config?: StoreConfig | null;
  store_config_v2?: StoreConfigV2 | null;
  store_config_v2_draft?: StoreConfigV2 | null;
  address?: string | null;
}

export interface Product extends BaseProduct {
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
  /** Approved-review aggregates, merged in by lib/queries (real data only). */
  review_count?: number;
  avg_rating?: number;
}

export interface ProductVariant extends BaseProductVariant {
  tenant_id: string;
  price: number;
  sku: string | null;
}
