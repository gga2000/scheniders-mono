// =====================================================================
// SEO helpers — request origin resolution + JSON-LD builders.
// Multi-tenant aware: a tenant is reachable via /s/<slug>, a subdomain,
// or a custom domain, so the public base URL is derived from the live
// request (proxy headers) rather than a single env var.
// =====================================================================

import { headers } from "next/headers";
import type { LocaleCode } from "@scheniders/shared";

/**
 * BCP-47 value for `<html lang>` (EC15). The root layout can't see the tenant,
 * so it renders a static `ar`; the tenant subtree corrects it from the store's
 * default locale. LTR-only project — only `lang` is ever set, never `dir`.
 */
export function htmlLangFor(locale: LocaleCode | null | undefined): string {
  return locale ?? "ar";
}

/** OpenGraph `locale` (language_TERRITORY) for a tenant locale (EC15) — so an
 *  en/ku store no longer advertises `ar_IQ` to crawlers and social cards. */
export function ogLocaleFor(locale: LocaleCode | null | undefined): string {
  return `${locale ?? "ar"}_IQ`;
}

/** Absolute origin (proto + host) of the current request, from proxy headers. */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

/**
 * Resolves the public base URL for a tenant storefront:
 *   - `origin`    — proto + host
 *   - `storeBase` — "" for subdomain / custom-domain mode, "/s/<slug>" for
 *                   path mode (mirrors the `x-store-base` header convention
 *                   used by the tenant layout)
 *   - `baseUrl`   — origin + storeBase, no trailing slash
 */
export async function getStorefrontBase(tenantParam: string): Promise<{
  origin: string;
  storeBase: string;
  baseUrl: string;
}> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host
    ? `${
        h.get("x-forwarded-proto") ??
        (host.startsWith("localhost") || host.startsWith("127.0.0.1")
          ? "http"
          : "https")
      }://${host}`
    : "";
  const storeBase = h.get("x-store-base") ?? `/s/${tenantParam}`;
  const baseUrl = `${origin}${storeBase}`.replace(/\/+$/, "");
  return { origin, storeBase, baseUrl };
}

type JsonLdObject = Record<string, unknown>;

export function organizationJsonLd(opts: {
  name: string;
  url: string;
  logo?: string | null;
  phone?: string | null;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: opts.name,
    url: opts.url,
    ...(opts.logo ? { logo: opts.logo } : {}),
    ...(opts.phone
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            telephone: opts.phone,
            contactType: "customer service",
            areaServed: "IQ",
          },
        }
      : {}),
  };
}

export function websiteJsonLd(opts: { name: string; url: string }): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: opts.name,
    url: opts.url,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${opts.url}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function productJsonLd(opts: {
  name: string;
  url: string;
  image?: string | string[] | null;
  description?: string | null;
  price: number;
  inStock: boolean;
  brand: string;
}): JsonLdObject {
  const hasImage =
    opts.image && (Array.isArray(opts.image) ? opts.image.length > 0 : true);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    ...(hasImage ? { image: opts.image } : {}),
    ...(opts.description ? { description: opts.description } : {}),
    brand: { "@type": "Brand", name: opts.brand },
    offers: {
      "@type": "Offer",
      url: opts.url,
      // Iraq market: prices are IQD, no tax/VAT.
      priceCurrency: "IQD",
      price: opts.price,
      availability: opts.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };
}

export function breadcrumbJsonLd(
  items: { name: string; url: string }[],
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
