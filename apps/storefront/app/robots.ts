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
          "/s/*/cart",
          "/s/*/checkout",
        ],
      },
    ],
  };
}
