/**
 * Storefront-facing types.
 * Base types come from @scheniders/shared; storefront extends them.
 */

import type { BaseTenant, BaseProduct, BaseProductVariant } from "@scheniders/shared";

// Re-export shared types used directly
export type { Category, CartItem, CheckoutFormData } from "@scheniders/shared";
export type { TenantBranding, TenantSettings, TenantStatus } from "@scheniders/shared";

export type TemplateName = "fashion" | "beauty" | "electronics" | "general" | "clean";

export interface StoreConfig {
  template?: TemplateName;
  hero?: {
    title?: string;
    subtitle?: string;
    cta_text?: string;
    image_url?: string;
  };
  about?: {
    enabled?: boolean;
    title?: string;
    body?: string;
  };
  contact?: {
    whatsapp_number?: string;
    instagram?: string;
    facebook?: string;
    tiktok?: string;
  };
  sections_order?: string[];
  enable_whatsapp_order?: boolean;
}

export interface Tenant extends BaseTenant {
  store_config?: StoreConfig | null;
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
}

export interface ProductVariant extends BaseProductVariant {
  tenant_id: string;
  price: number;
  sku: string | null;
}
