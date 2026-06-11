export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";

/**
 * Statuses whose storefront is publicly readable by anon visitors — must mirror
 * the `public_storefront_read` RLS predicate (`status IN ('trial','active')`).
 * A tenant with a published config in one of these is genuinely live/taking orders.
 */
export const STOREFRONT_PUBLIC_STATUSES: readonly TenantStatus[] = [
  "trial",
  "active",
];

/** True when the tenant's storefront is publicly reachable (live), not just a draft. */
export function isStorePubliclyLive(status: TenantStatus | string | null | undefined): boolean {
  return (
    status != null &&
    STOREFRONT_PUBLIC_STATUSES.includes(status as TenantStatus)
  );
}

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
