// =====================================================================
// SEO helpers — request origin resolution + JSON-LD builders.
// Multi-tenant aware: a tenant is reachable via /s/<slug>, a subdomain,
// or a custom domain, so the public base URL is derived from the live
// request (proxy headers) rather than a single env var.
// =====================================================================

import { headers } from "next/headers";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode, PageConfig } from "@scheniders/shared";

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

/**
 * `offers.shippingDetails` from the store's REAL shipping configuration.
 * Returns undefined when there is nothing true to say, so the offer simply
 * omits the field rather than advertising a rate the checkout won't charge.
 *
 * A store with per-governorate rates gets a min/max MonetaryAmount, which is
 * exactly what a shopper sees on the product page.
 */
export function shippingDetailsJsonLd(opts: {
  minFeeIqd: number;
  maxFeeIqd: number;
  /** Real published ETA in hours — a range, because rates may differ by
   *  governorate. Null/absent when the merchant published none. */
  etaHours?: { min: number; max: number } | null;
}): JsonLdObject | undefined {
  if (!Number.isFinite(opts.minFeeIqd) || opts.minFeeIqd < 0) return undefined;
  // The max was never checked, so a non-finite one serialised as
  // `"maxValue": null` — a malformed Offer that Google reads as a broken
  // shipping rate rather than a missing one. A max that is not a usable
  // number means there is no range to state, so state the min alone.
  const maxUsable =
    Number.isFinite(opts.maxFeeIqd) && opts.maxFeeIqd >= opts.minFeeIqd;
  const sameRate = !maxUsable || opts.minFeeIqd === opts.maxFeeIqd;
  const eta =
    opts.etaHours && opts.etaHours.min > 0 && opts.etaHours.max > 0 ? opts.etaHours : null;
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      currency: "IQD",
      ...(sameRate
        ? { value: opts.minFeeIqd }
        : { minValue: opts.minFeeIqd, maxValue: opts.maxFeeIqd }),
    },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "IQ" },
    // Only when the merchant published an ETA. Hours round up to whole days,
    // which is the unit Google reads; no ETA means no deliveryTime at all.
    ...(eta
      ? {
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            transitTime: {
              "@type": "QuantitativeValue",
              minValue: Math.max(1, Math.ceil(eta.min / 24)),
              maxValue: Math.max(1, Math.ceil(eta.max / 24)),
              unitCode: "DAY",
            },
          },
        }
      : {}),
  };
}

/**
 * `offers.hasMerchantReturnPolicy` from the store's real returns window.
 * Undefined when the merchant has not set one — an invented return window is
 * a promise they would have to honour.
 *
 * Return fees and method are deliberately absent: we know the window, not who
 * pays the courier.
 */
export function returnPolicyJsonLd(windowDays: number | null | undefined): JsonLdObject | undefined {
  if (typeof windowDays !== "number" || !Number.isFinite(windowDays) || windowDays <= 0) {
    return undefined;
  }
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "IQ",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: Math.round(windowDays),
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
  /** Real approved-review aggregates — emitted only when count > 0. */
  ratingAverage?: number | null;
  ratingCount?: number | null;
  /** The merchant's own stock-keeping unit, when they set one. */
  sku?: string | null;
  /** From `shippingDetailsJsonLd` / `returnPolicyJsonLd`; omitted when unknown. */
  shippingDetails?: JsonLdObject;
  returnPolicy?: JsonLdObject;
}): JsonLdObject {
  const hasImage =
    opts.image && (Array.isArray(opts.image) ? opts.image.length > 0 : true);
  const hasRating =
    typeof opts.ratingCount === "number" &&
    opts.ratingCount > 0 &&
    typeof opts.ratingAverage === "number";
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    ...(hasImage ? { image: opts.image } : {}),
    ...(opts.description ? { description: opts.description } : {}),
    ...(hasRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(opts.ratingAverage!.toFixed(2)),
            reviewCount: opts.ratingCount,
          },
        }
      : {}),
    brand: { "@type": "Brand", name: opts.brand },
    ...(opts.sku ? { sku: opts.sku } : {}),
    offers: {
      "@type": "Offer",
      url: opts.url,
      // Iraq market: prices are IQD, no tax/VAT.
      priceCurrency: "IQD",
      price: opts.price,
      availability: opts.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: opts.brand },
      // Google also reads `priceValidUntil` and `itemCondition`. Neither is
      // emitted: the merchant sets no price expiry, and a store may sell
      // open-box or used goods — a blanket "new" would be a claim we cannot
      // stand behind. A missing recommended field is a warning; a wrong one
      // is a lie in a search result.
      ...(opts.shippingDetails ? { shippingDetails: opts.shippingDetails } : {}),
      ...(opts.returnPolicy ? { hasMerchantReturnPolicy: opts.returnPolicy } : {}),
    },
  };
}

/**
 * FAQ rich results. Built from the merchant's OWN questions — pass an empty
 * list and it returns undefined, because a page with no questions must not
 * claim to be an FAQ.
 */
export function faqPageJsonLd(
  items: { question: string; answer: string }[],
): JsonLdObject | undefined {
  const clean = items
    .map((i) => ({ question: i.question.trim(), answer: i.answer.trim() }))
    .filter((i) => i.question !== "" && i.answer !== "");
  if (clean.length === 0) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: clean.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

/**
 * A collection page's products, in the order the shopper sees them. Undefined
 * for an empty collection.
 */
export function itemListJsonLd(opts: {
  name: string;
  items: { name: string; url: string }[];
}): JsonLdObject | undefined {
  if (opts.items.length === 0) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: opts.name,
    numberOfItems: opts.items.length,
    itemListElement: opts.items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
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

/**
 * The merchant's own questions, pulled out of whichever FAQ section they
 * placed on the page. Section props are the source — never a hardcoded list —
 * so the rich result always matches what the page actually says.
 */
export function faqItemsFromPage(
  page: PageConfig | null | undefined,
  locale: LocaleCode,
): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  for (const section of page?.sections ?? []) {
    if (section.enabled === false) continue;
    if (section.type !== "faq_accordion" && section.type !== "faq_contact_split") continue;
    const items = (section.base as { items?: unknown }).items;
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const item = raw as { q_i18n?: unknown; a_i18n?: unknown };
      const question = resolveI18n(item.q_i18n as never, locale);
      const answer = resolveI18n(item.a_i18n as never, locale);
      if (question.trim() && answer.trim()) out.push({ question, answer });
    }
  }
  return out;
}

/**
 * An `Article` for a merchant-authored guide.
 *
 * Every field is omitted rather than guessed. Google warns about a missing
 * recommended field and penalises a wrong one, and the fields most tempting
 * to invent here are exactly the ones that would be lies: an author the
 * merchant never named, a publish date for a guide they never dated, an
 * image that is really the store's logo. Undefined when there is not even a
 * headline to describe.
 */
export function articleJsonLd(opts: {
  headline: string;
  url: string;
  description?: string;
  imageUrl?: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  publisherName?: string;
  publisherLogoUrl?: string;
}): JsonLdObject | undefined {
  const headline = opts.headline.trim();
  if (!headline) return undefined;

  const description = opts.description?.trim();
  const author = opts.author?.trim();
  const publisher = opts.publisherName?.trim();

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    mainEntityOfPage: { "@type": "WebPage", "@id": opts.url },
    url: opts.url,
    ...(description ? { description } : {}),
    ...(opts.imageUrl ? { image: [opts.imageUrl] } : {}),
    ...(opts.datePublished ? { datePublished: opts.datePublished } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    ...(author ? { author: { "@type": "Person", name: author } } : {}),
    ...(publisher
      ? {
          publisher: {
            "@type": "Organization",
            name: publisher,
            ...(opts.publisherLogoUrl
              ? { logo: { "@type": "ImageObject", url: opts.publisherLogoUrl } }
              : {}),
          },
        }
      : {}),
  };
}
