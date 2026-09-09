// =====================================================================
// Section — search_results_grid
// =====================================================================
// Renders product search results. The query arrives server-side as
// `ctx.runtime.search_query` (the storefront /search route copies `?q=`
// into the runtime), so the SSR pass already paints the filtered list —
// no flash of the full catalogue, no layout shift after hydration
// (P0-7 / P2-27). Matches every whitespace-separated token against
// product `name`, `sku` and (when present) `description`. A plain GET
// search form sits at the top so the page works without a header search
// (and without JS); it is prefilled with the current query.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { SearchResultsGridRender } from "./search_results_grid.client";

const schema = z.object({
  empty_state_message_i18n: i18nStringSchema,
  cols_mobile: z.union([z.literal(1), z.literal(2)]),
  cols_desktop: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  /** Mirrors product_grid: "standard" = bento card, "price_pill" = soft
   *  rounded photo card. Optional so stored configs keep parsing. */
  card_style: z.enum(["standard", "price_pill"]).optional(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  empty_state_message_i18n: {
    en: "No products matched your search.",
    ar: "لا توجد منتجات تطابق بحثك.",
  },
  cols_mobile: 2,
  cols_desktop: 4,
};

const definition: SectionDefinition<Props> = {
  type: "search_results_grid",
  category: "page",
  name: { en: "Search results", ar: "نتائج البحث" },
  description: {
    en: "Search form + results grid filtered server-side from ?q= with empty-state fallback.",
    ar: "نموذج بحث وشبكة نتائج مفلترة من ?q= على الخادم مع حالة فارغة.",
  },
  thumbnail: "/sections/search_results_grid.svg",
  valid_on: ["search"],
  schema,
  defaultProps,
  render: SearchResultsGridRender,
};

registerSection(definition);
export default definition;
