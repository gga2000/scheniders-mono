import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { enforceRedirect } from "@/lib/redirects";

interface Props {
  params: Promise<{ tenant: string; rest: string[] }>;
}

/**
 * Catch-all for paths no concrete route claims (N3 follow-up).
 *
 * Slug-driven routes (products/categories/custom pages) already honor a
 * tenant's configured `redirects` before 404ing — but arbitrary legacy
 * paths from a merchant's previous platform (`/aboutus`,
 * `/collections/all`, `/Order-status`, …) matched NO route at all, so
 * their redirect rules were dead config and inbound ad/search/WhatsApp
 * links broke on migration. Next prefers concrete routes over this
 * catch-all, so real pages are unaffected; anything landing here gets one
 * chance at a configured redirect, then the normal 404.
 */
export default async function LegacyPathCatchAll({ params }: Props) {
  const { tenant: tenantParam, rest } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);

  if (!tenant) notFound();

  enforceRedirect(
    tenant.store_config_v2,
    tenantParam,
    `/${rest.map((s) => decodeURIComponent(s)).join("/")}`,
  );
  notFound();
}
