// =====================================================================
// page-structured-data — schema derived from what a page actually renders
// =====================================================================
// The rule here is that nothing is re-derived. The product list comes
// from the grid's own `selectProducts`, the questions come from the FAQ
// section's own items. Rebuilding either in the page is how a schema
// block ends up describing a different set of products than the one on
// screen — which is worse than emitting no schema at all.
//
// Every builder returns null when it has nothing true to say, and the
// caller drops nulls.
// =====================================================================

import { selectProducts } from "@scheniders/sections";
import type { SectionRenderContext } from "@scheniders/sections";
import type { PageConfig, RuntimeContext } from "@scheniders/shared";
import { resolveI18n } from "@scheniders/shared";
import { itemListJsonLd, faqJsonLd, faqItemsFromPage } from "./seo";

type JsonLdObject = Record<string, unknown>;

/** First enabled section of a type, with its resolved props. */
function findSection(
  page: PageConfig,
  type: string,
): Record<string, unknown> | null {
  const hit = page.sections?.find(
    (s) => s.type === type && s.enabled !== false,
  );
  return (hit?.base as Record<string, unknown> | undefined) ?? null;
}

/**
 * `ItemList` for the merchandising grid, in the order it renders.
 *
 * Entries point at each product's own page, where the full `Product`
 * markup lives. The list does not restate those products — a duplicate
 * Product on a listing page is what gets flagged as mismatched.
 */
export function buildGridItemList(
  page: PageConfig,
  ctx: Omit<SectionRenderContext, "runtime">,
  runtime: RuntimeContext,
  baseUrl: string,
): JsonLdObject | null {
  const base = findSection(page, "product_grid");
  if (!base) return null;

  let products: ReturnType<typeof selectProducts>;
  try {
    products = selectProducts(base as never, {
      ...ctx,
      runtime,
    } as SectionRenderContext);
  } catch {
    // A malformed grid config must not take the whole page down over
    // markup the shopper never sees.
    return null;
  }

  const items = products
    .filter((p) => p.slug || p.id)
    .map((p) => ({
      name: p.name,
      url: `${baseUrl}/products/${p.slug ?? p.id}`,
    }));

  const heading = resolveI18n(
    (base.heading_i18n as Parameters<typeof resolveI18n>[0]) ?? {},
    runtime.locale,
  );

  return itemListJsonLd({ name: heading || "", items });
}

/**
 * `FAQPage` from the questions the page actually shows — every enabled
 * `faq_accordion` / `faq_contact_split` on it, read the same way the FAQ
 * page reads them.
 */
export function buildFaqSchema(
  page: PageConfig,
  runtime: RuntimeContext,
): JsonLdObject | null {
  return faqJsonLd(faqItemsFromPage(page, runtime.locale));
}
