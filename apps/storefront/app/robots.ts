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
          "/s/_preview/",
          "/s/*/cart",
          "/s/*/checkout",
        ],
      },
    ],
  };
}
