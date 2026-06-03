import type { RuntimeContext, PageId, LocaleCode, GovernorateCode } from "@scheniders/shared";

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
