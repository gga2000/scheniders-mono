import { notFound, permanentRedirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { resolveRenamedSlug } from "@/lib/slug-redirect";
import { getCategoryBySlug, getProductBySlug } from "@/lib/queries";
import { enforceRedirect } from "@/lib/redirects";
import type { Category, Product, Tenant } from "@/lib/types";

/**
 * Route guards: the lookups that decide a storefront response's status.
 *
 * A loading.tsx streams the shell — and the 200 with it — before the segments
 * inside it run, so a notFound() or redirect thrown in there arrives too late:
 * a missing product becomes a soft 404 and a merchant's 308 a meta refresh.
 * These guards are therefore called by a layout that sits OUTSIDE the
 * boundary (that call decides the status), and again by the page inside it to
 * get the narrowed value. Every lookup underneath is React-cached, so the
 * second call costs no round-trip. app/route-status-boundaries.test.ts holds
 * the line.
 */

/** The tenant a `[tenant]` param names (a slug, or `__domain__<host>`). */
export function resolveStoreTenant(tenantParam: string): Promise<Tenant | null> {
  return tenantParam.startsWith("__domain__")
    ? getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : getTenantBySlug(tenantParam);
}

/**
 * Where a renamed store's old link should land, or null to 404.
 *
 * Path mode (`/s/<old>`) moves to `/s/<new>`; subdomain mode (the proxy
 * sets `x-store-base: ""`) moves to `<new>.` on the same root host. Custom
 * domains never reach here: their param is `__domain__<host>`, and a host
 * is not a slug.
 */
export function renamedStoreTarget(
  renamed: string,
  storeBase: string | null,
  host: string | null,
  proto: string | null,
): string | null {
  if (storeBase !== "") return `/s/${renamed}`;
  const dot = host?.indexOf(".") ?? -1;
  if (!host || dot < 0) return null;
  return `${proto === "http" ? "http" : "https"}://${renamed}${host.slice(dot)}`;
}

/** A tenant that can be shown at all — unknown and cancelled stores 404.
 *  (A suspended store still resolves; the tenant layout renders its notice.)
 *  An unknown slug a store used to own 308s to that store's current slug
 *  (UX2-13 handle claim), so links already shared keep working. */
export async function requireStoreTenant(tenantParam: string): Promise<Tenant> {
  const tenant = await resolveStoreTenant(tenantParam);
  if (!tenant && !tenantParam.startsWith("__domain__")) {
    const renamed = await resolveRenamedSlug(tenantParam);
    if (renamed) {
      const h = await headers();
      const target = renamedStoreTarget(
        renamed,
        h.get("x-store-base"),
        h.get("host"),
        h.get("x-forwarded-proto"),
      );
      if (target) permanentRedirect(target);
    }
  }
  if (!tenant || tenant.status === "cancelled") notFound();
  return tenant;
}

/** The product a `/products/[slug]` URL names. A missing slug first honours
 *  the merchant's published redirect (308/307), then 404s. */
export async function requireProduct(
  tenantParam: string,
  slug: string,
): Promise<{ tenant: Tenant; product: Product }> {
  const tenant = await requireStoreTenant(tenantParam);
  const product = await getProductBySlug(tenant.id, slug);
  if (!product) {
    enforceRedirect(tenant.store_config_v2, tenantParam, `/products/${slug}`);
    notFound();
  }
  return { tenant, product };
}

/** The category a `/categories/[slug]` URL names, with the same redirect-
 *  then-404 fallthrough as products. */
export async function requireCategory(
  tenantParam: string,
  slug: string,
): Promise<{ tenant: Tenant; category: Category }> {
  const tenant = await requireStoreTenant(tenantParam);
  const category = await getCategoryBySlug(tenant.id, slug);
  if (!category) {
    enforceRedirect(tenant.store_config_v2, tenantParam, `/categories/${slug}`);
    notFound();
  }
  return { tenant, category };
}
