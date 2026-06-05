import type { RuntimeContext, PageId, LocaleCode, GovernorateCode, StoreConfigV2, PageConfig } from "@scheniders/shared";

/** Return the v2 PageConfig for `pageId` ONLY if it exists and has >=1 section.
 *  Returns null otherwise so the caller falls back to the legacy template
 *  (prevents rendering a blank page for empty/un-populated v2 pages). */
export function pickV2Page(v2: StoreConfigV2 | null | undefined, pageId: PageId): PageConfig | null {
  if (!v2) return null;
  const page = v2.pages.find((p) => p.page_id === pageId);
  if (!page || page.sections.length === 0) return null;
  return page;
}

/** Build a server-side RuntimeContext for the public storefront. breakpoint defaults
 *  to "mobile" (SSR-safe; CSS handles responsive). audience_segments / ab_test_arms are
 *  empty in Phase 1 — populated by the segments/experiments phase. */
export function buildRuntimeContext(opts: {
  pageId: PageId;
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
