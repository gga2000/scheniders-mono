/**
 * Storefront-facing types. Mirrors a subset of the platform DB schema.
 */

export type TemplateName = "fashion" | "beauty" | "electronics" | "general" | "clean";

export interface TenantBranding {
  logo_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  font?: string;
}

export interface TenantSettings {
  timezone?: string;
  language?: string;
  currency?: string;
}

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

export interface Tenant {
  id: string;
  business_name: string;
  slug: string;
  plan: string;
  status: "trial" | "active" | "suspended" | "cancelled";
  branding: TenantBranding;
  settings: TenantSettings;
  store_config?: StoreConfig | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  city?: string | null;
}

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  stock_quantity: number;
  reserved_quantity: number;
  sku: string | null;
  is_archived: boolean;
  // Storefront-only fields (added in storefront migration)
  slug?: string | null;
  is_visible?: boolean;
  category_id?: string | null;
  display_order?: number;
  images?: string[];
}

export interface ProductVariant {
  id: string;
  product_id: string;
  tenant_id: string;
  name: string;
  price: number;
  stock_quantity: number;
  sku: string | null;
}

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  display_order: number;
}

export interface CartItem {
  product_id: string;
  variant_id: string | null;
  name: string;
  variant_name: string | null;
  price: number;
  quantity: number;
  image_url: string | null;
}

export interface CheckoutFormData {
  customer_name: string;
  phone: string;
  governorate_code: string;
  city: string;
  address_details: string;
  notes?: string;
}
