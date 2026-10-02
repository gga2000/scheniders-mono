import type { Metadata } from "next";
import type {
  RuntimeContext,
  PageId,
  LocaleCode,
  GovernorateCode,
  StoreConfigV2,
  PageConfig,
  SectionInstance,
} from "@scheniders/shared";
import { resolveI18n } from "@scheniders/shared";

/** Return the v2 PageConfig for `pageId` ONLY if it exists and has >=1 section.
 *  Returns null otherwise so the caller falls back to the legacy template
 *  (prevents rendering a blank page for empty/un-populated v2 pages). */
export function pickV2Page(
  v2: StoreConfigV2 | null | undefined,
  pageId: PageId,
): PageConfig | null {
  // EC7: a malformed config (e.g. `pages` patched to a non-array) must degrade
  // to the legacy/empty fallback, not crash `.find` on the public store —
  // generateMetadata isn't wrapped by an error boundary, so a throw here is a
  // hard 500 reachable by any member who can write the config.
  if (!v2 || !Array.isArray(v2.pages)) return null;
  const page = v2.pages.find((p) => p.page_id === pageId);
  if (!page || !Array.isArray(page.sections) || page.sections.length === 0) {
    return null;
  }
  return page;
}

/**
 * Build Next.js Metadata from a V2 page's PageMeta, if present.
 * Returns `{}` when the page has no meta so the layout's tenant-level
 * metadata applies unchanged — no page regresses.
 */
export function resolveV2PageMetadata(
  v2: StoreConfigV2 | null | undefined,
  pageId: PageId,
  locale: LocaleCode,
): Metadata {
  // EC7: guard non-array `pages` (malformed config) — this runs inside
  // generateMetadata, which has no error boundary, so a throw is a hard 500.
  const page = Array.isArray(v2?.pages)
    ? v2.pages.find((p) => p.page_id === pageId)
    : undefined;
  const m = page?.meta;
  if (!m) return {};

  const title = m.title ? resolveI18n(m.title, locale) : undefined;
  const description = m.description
    ? resolveI18n(m.description, locale)
    : undefined;

  const md: Metadata = {};
  if (title) md.title = title;
  if (description) md.description = description;
  if (m.noindex) md.robots = { index: false, follow: false };
  if (title || description || m.og_image_url) {
    md.openGraph = {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(m.og_image_url ? { images: [m.og_image_url] } : {}),
    };
  }
  return md;
}

/** Build a server-side RuntimeContext for the public storefront. breakpoint defaults
 *  to "mobile" (SSR-safe; CSS handles responsive). audience_segments / ab_test_arms are
 *  empty in Phase 1 — populated by the segments/experiments phase. */
export function buildRuntimeContext(opts: {
  /** System PageId, or a custom page's slug (page-conditioned variants match
   *  only system PageIds, so a slug simply matches none). */
  pageId: PageId | (string & {});
  locale: LocaleCode;
  now: Date;
  governorate?: GovernorateCode;
  productId?: string;
  categoryId?: string;
  /** Thank-you page: the order number from `?order=` (already sanitised). */
  orderNumber?: string;
  /** Search page: the query from `?q=` (already trimmed via resolveSearchQuery). */
  searchQuery?: string;
}): RuntimeContext {
  return {
    page_id: opts.pageId,
    breakpoint: "mobile",
    locale: opts.locale,
    audience_segments: [],
    ab_test_arms: {},
    governorate: opts.governorate,
    product_id: opts.productId,
    category_id: opts.categoryId,
    ...(opts.orderNumber ? { order_number: opts.orderNumber } : {}),
    ...(opts.searchQuery ? { search_query: opts.searchQuery } : {}),
    now: opts.now,
  };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Search query                                                         */
/* ─────────────────────────────────────────────────────────────────── */

/** Longest query the search page honours — anything past this is noise
 *  (a pasted paragraph, a probe) and would only widen the metadata title. */
export const SEARCH_QUERY_MAX_LENGTH = 100;

/**
 * Normalise the raw `?q=` search param into the string the runtime carries:
 * first value when repeated, trimmed, whitespace collapsed, length-capped.
 * Returns "" when there is nothing to search for.
 */
export function resolveSearchQuery(raw: string | string[] | undefined): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return "";
  return first.replace(/\s+/g, " ").trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
}

/* ─────────────────────────────────────────────────────────────────── */
/* Order number                                                         */
/* ─────────────────────────────────────────────────────────────────── */

/** Order numbers are short opaque tokens; anything longer is not one. */
const ORDER_NUMBER_MAX_LENGTH = 40;

/**
 * Normalise the raw `?order=` param for the thank-you page. Keeps only a
 * plain printable token (letters, digits, `-`, `_`, `#`) so a crafted URL
 * can't inject markup-looking text into the page or the WhatsApp prefill.
 */
export function resolveOrderNumber(raw: string | string[] | undefined): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return "";
  const trimmed = first.trim().slice(0, ORDER_NUMBER_MAX_LENGTH);
  return /^[\p{L}\p{N}#_-]+$/u.test(trimmed) ? trimmed : "";
}

/* ─────────────────────────────────────────────────────────────────── */
/* Catalogue page (/products)                                           */
/* ─────────────────────────────────────────────────────────────────── */

/** The catalogue page title — shared by the derived grid and the route's h1. */
export const CATALOG_HEADING = {
  ar: "كل المنتجات",
  en: "All products",
} as const;

/**
 * The catalogue page's own header. Factual, not a claim: it names what the
 * page is and what the controls beneath it do. A merchant who wants their
 * own words sets them on the category grid — anything present there wins,
 * and these only fill the gap.
 */
export const CATALOG_EYEBROW = {
  ar: "المجموعة الكاملة",
  en: "The full collection",
} as const;

export const CATALOG_SUBHEADING = {
  // No trailing full stop: the page is LTR, so a sentence-final "."
  // on Arabic text lands at the LEFT edge and reads as a stray mark.
  ar: "كل عطورنا بمكان واحد — اختار حسب الفئة أو السعر",
  en: "Every perfume in one place — browse by category or by price",
} as const;

const CATALOG_SECTION_ID = "__catalog_all_products__";

/**
 * Derive the all-products page from the tenant's V2 `category` page (P0-3).
 *
 * There is no `catalog` PageId, so the catalogue used to be a synthetic
 * default `product_grid` that ignored the template — Candy cards on a calm
 * store. Instead we clone the first `product_grid` of the merchant's
 * category page (same `base`, so `card_style`, `show_stars`, eyebrow and the
 * rest carry over), force auto mode over the whole catalogue (no `limit`, no
 * `category_slug`) and retitle it "كل المنتجات". Only `base` is copied —
 * variants/visibility rules on the category grid target the category page.
 *
 * Fallback (no category page, or no product_grid on it): the plain default
 * grid, with `card_style: "price_pill"` for calm kits (rotation "none") so
 * they still don't get the Candy card.
 */
export function deriveCatalogPage(v2: StoreConfigV2): PageConfig {
  const categoryPage = pickV2Page(v2, "category");
  const source = categoryPage?.sections.find(
    (s) => s.type === "product_grid" && s.enabled !== false,
  );

  let base: Record<string, unknown>;
  if (source) {
    const { query, ...rest } = source.base;
    const sourceQuery =
      query && typeof query === "object" && !Array.isArray(query)
        ? (query as Record<string, unknown>)
        : {};
    const catalogQuery = Object.fromEntries(
      Object.entries(sourceQuery).filter(
        ([key]) => key !== "limit" && key !== "category_slug",
      ),
    );
    base = {
      ...rest,
      mode: "auto",
      query: catalogQuery,
      heading_i18n: CATALOG_HEADING,
      // The merchant's own eyebrow and standfirst win where they exist;
      // these only fill an empty header.
      eyebrow_i18n: rest.eyebrow_i18n ?? CATALOG_EYEBROW,
      subheading_i18n: rest.subheading_i18n ?? CATALOG_SUBHEADING,
    };
  } else {
    const calm = v2.brand_kit?.shape?.rotation_intensity === "none";
    base = {
      mode: "auto",
      query: { sort: "newest" },
      heading_i18n: CATALOG_HEADING,
      eyebrow_i18n: CATALOG_EYEBROW,
      subheading_i18n: CATALOG_SUBHEADING,
      scribble_color: "mint",
      manual_product_ids: [],
      pinned_product_ids: [],
      ...(calm ? { card_style: "price_pill" } : {}),
    };
  }

  // This page is the whole shop, so it gets the catalogue controls: category
  // chips with live counts, sort, a price split and load-more. Only the
  // price_pill card style implements them — the "standard" style already has
  // its own FilterableProductGrid — so setting the flag on a standard grid
  // would be a promise the section cannot keep. Applied after both branches
  // so the fallback base gets it too when the kit resolves to price_pill.
  if (base.card_style === "price_pill") {
    base.catalog_controls = true;
    // And a search field: this store's header has search switched off, so
    // without this the only way to look for a perfume by name is to scroll
    // the whole catalogue. The /search page exists but nothing links to it.
    base.catalog_search = true;
  }

  const section: SectionInstance = {
    id: CATALOG_SECTION_ID,
    type: "product_grid",
    enabled: true,
    base,
  };
  // page_id stays "category" — the closest system id; product_grid doesn't
  // read it, and page-conditioned variants for "category" don't apply
  // because only `base` was cloned.
  return { page_id: "category", sections: [section] };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Tenant key from request headers (not-found.tsx)                      */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Recover the `[tenant]` route param from request headers. `not-found.tsx`
 * receives no params, so it reads what `proxy.ts` leaves behind:
 *
 *   - path mode      → `x-store-base: /s/<slug>`            → "<slug>"
 *   - subdomain mode → `x-store-base: ""` + host `<slug>.<root>` → "<slug>"
 *   - custom domain  → `x-store-base: ""` + any other host  → "__domain__<host>"
 *
 * Mirrors `extractSlug` in proxy.ts (root / www → null). Returns null when
 * nothing identifies a tenant so the caller renders the tenant-less fallback.
 */
/** The proxy copies the raw pathname segment, which may still be
 *  percent-encoded. A malformed escape is not a tenant — treat it as none
 *  rather than letting `decodeURIComponent` throw inside the 404 page. */
function safeDecode(segment: string): string | null {
  if (!segment.includes("%")) return segment;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function resolveTenantKeyFromHeaders(input: {
  storeBase: string | null;
  host: string | null;
  rootDomain: string;
}): string | null {
  const base = input.storeBase ?? "";
  if (base.startsWith("/s/")) {
    const slug = base.slice(3).split("/")[0];
    return slug ? safeDecode(slug) : null;
  }
  const hostNoPort = (input.host ?? "").split(":")[0].toLowerCase();
  if (!hostNoPort) return null;
  const rootNoPort = input.rootDomain.split(":")[0].toLowerCase();
  if (hostNoPort === rootNoPort || hostNoPort === `www.${rootNoPort}`) {
    return null;
  }
  if (hostNoPort.endsWith(`.${rootNoPort}`)) {
    const slug = hostNoPort.slice(0, -1 - rootNoPort.length);
    return slug || null;
  }
  return `__domain__${hostNoPort}`;
}
