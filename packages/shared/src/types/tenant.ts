export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";

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

/** Fields shared by both platform and storefront Tenant types. */
export interface BaseTenant {
  id: string;
  business_name: string;
  slug: string;
  plan: string;
  status: TenantStatus;
  branding: TenantBranding;
  settings: TenantSettings;
  contact_email?: string | null;
  contact_phone?: string | null;
  city?: string | null;
}
