import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
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

/** A tenant that can be shown at all — unknown and cancelled stores 404.
 *  (A suspended store still resolves; the tenant layout renders its notice.) */
export async function requireStoreTenant(tenantParam: string): Promise<Tenant> {
  const tenant = await resolveStoreTenant(tenantParam);
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
