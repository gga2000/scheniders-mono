import type { MetadataRoute } from "next";

// Allow crawling of storefront content; keep API, preview, and the
// non-indexable cart/checkout funnel out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
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
