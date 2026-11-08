import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { extractSlug, storefrontRootDomain } from "@/lib/store-host";

// Allow crawling of storefront content; keep API, preview, and the
// non-indexable cart/checkout funnel out of the index.
/**
 * The store's own sitemap, when this request arrived on a store's host.
 *
 * A sitemap is per tenant, and `/robots.txt` is one file per host. On a
 * store's subdomain or custom domain that host *is* the store, so it can name
 * `/sitemap.xml` — the proxy rewrites it to that tenant's route. On the
 * platform root the same file is shared by every path-based store at once, so
 * there is no single sitemap it could honestly point at, and it names none.
 */
async function sitemapForHost(): Promise<string | undefined> {
  const h = await headers();
  const rawHost = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const host = rawHost.split(":")[0].toLowerCase();
  if (!host) return undefined;
  // Same reading as the proxy: only the bare root is path mode (no one store).
  if (!extractSlug(rawHost, storefrontRootDomain()).slug) return undefined;
  const proto =
    h.get("x-forwarded-proto") ??
    (host === "localhost" || host === "127.0.0.1" ? "http" : "https");
  return `${proto}://${rawHost}/sitemap.xml`;
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const sitemap = await sitemapForHost();
  return {
    ...(sitemap ? { sitemap } : {}),
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          // Editor draft preview — token-gated, never indexable. The route
          // lives at /_preview/ (NOT /s/_preview/); the old path matched
          // nothing, so drafts were crawlable. Defense-in-depth: the route
          // also returns a noindex robots meta tag.
          "/_preview/",
          // Funnel pages, both URL shapes: path-based stores on the root domain
          // (/s/<tenant>/cart) AND subdomain/custom-domain stores, which the
          // proxy rewrites from a root-relative "/cart" — so "/s/*/cart" alone
          // left every custom-domain store's funnel crawlable.
          "/s/*/cart",
          "/s/*/checkout",
          "/cart",
          "/checkout",
        ],
      },
    ],
  };
}
