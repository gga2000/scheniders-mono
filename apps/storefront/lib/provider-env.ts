import { z } from "zod";
import { parseProviderBaseUrls, providerBaseUrlSchema, type RawEnv } from "@scheniders/shared/provider-base-url";

/**
 * Storefront outbound provider hosts (PKG-00 approach 6a). Env var name → the
 * real host used when the variable is unset. A mock URL is accepted only
 * outside `VERCEL_ENV=production`; see `@scheniders/shared/provider-base-url`.
 * PKG-05 folds this into the storefront's full env schema.
 */
export const STOREFRONT_PROVIDER_DEFAULTS = {
  META_API_BASE_URL: "https://graph.facebook.com",
  TIKTOK_API_BASE_URL: "https://business-api.tiktok.com",
} as const;

export function parseStorefrontProviderBaseUrls(raw: RawEnv) {
  const d = STOREFRONT_PROVIDER_DEFAULTS;
  return parseProviderBaseUrls(raw, (production) =>
    z.object({
      META_API_BASE_URL: providerBaseUrlSchema(d.META_API_BASE_URL, production),
      TIKTOK_API_BASE_URL: providerBaseUrlSchema(d.TIKTOK_API_BASE_URL, production),
    }),
  );
}

/**
 * Validated at import so a refused value fails the boot, not the first
 * purchase. Browser bundles get the real hosts, never a value read from the
 * browser's `process` polyfill (CAPI runs on the server only).
 */
export const providerBaseUrls = parseStorefrontProviderBaseUrls(
  typeof window === "undefined" ? process.env : {},
);
