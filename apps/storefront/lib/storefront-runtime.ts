import type { Metadata } from "next";
import type { RuntimeContext, PageId, LocaleCode, GovernorateCode, StoreConfigV2, PageConfig } from "@scheniders/shared";
import { resolveI18n } from "@scheniders/shared";

/** Return the v2 PageConfig for `pageId` ONLY if it exists and has >=1 section.
 *  Returns null otherwise so the caller falls back to the legacy template
 *  (prevents rendering a blank page for empty/un-populated v2 pages). */
export function pickV2Page(v2: StoreConfigV2 | null | undefined, pageId: PageId): PageConfig | null {
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
  const description = m.description ? resolveI18n(m.description, locale) : undefined;

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
    now: opts.now,
  };
}
