// =====================================================================
// Section — pdp_related_products
// =====================================================================
// "You might also like" horizontal carousel for the PDP. Sources from
// ctx.relatedProducts when it exists, otherwise falls back to
// ctx.products with the current product filtered out. Renders nothing
// when no products are available.
// =====================================================================

import { z } from "zod";
import { attributeSimilarity, resolveI18n } from "@scheniders/shared";
import { Section, SectionHeader } from "./helpers/primitives";
import { SchneidersProductCard } from "./helpers/product-card";
import type { Product } from "./types";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  layout: z.enum(["carousel", "grid"]),
  limit: z.number().int().positive().max(20),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "You might also like", ar: "قد يعجبك أيضاً" },
  layout: "carousel",
  limit: 8,
};

function PdpRelatedProductsRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);

  // `relatedProducts` is optional and may be set by the upstream page
  // resolver — we read it via a loose accessor so we don't require a
  // shared-types change.
  const related =
    (ctx as unknown as { relatedProducts?: Product[] }).relatedProducts ??
    null;

  const pool: Product[] = (() => {
    if (related && related.length > 0) return related;
    if (!ctx.product) return ctx.products ?? [];
    const currentId = ctx.product.id;
    const currentCategory = ctx.product.category_id ?? null;
    const others = (ctx.products ?? []).filter((p) => p.id !== currentId);

    // When the merchant has marked attributes comparable, "related" can mean
    // what it says: rank by how alike the products actually are. Falls back
    // to category-first for anything with no comparable overlap, so a
    // half-filled catalogue degrades product by product rather than all at
    // once.
    const own = ctx.product.attributes ?? [];
    if (own.length > 0) {
      const scored = others.map((p) => ({
        product: p,
        score: attributeSimilarity(own, p.attributes ?? []),
      }));
      if (scored.some((s) => s.score !== null)) {
        return [...scored]
          .sort((a, b) => {
            // Unscored products sort below every scored one rather than
            // being dropped — the grid should still fill.
            if (a.score === null && b.score === null) return 0;
            if (a.score === null) return 1;
            if (b.score === null) return -1;
            return b.score - a.score;
          })
          .map((s) => s.product);
      }
    }

    // Prefer same-category products first, then anything else.
    const same = others.filter((p) => p.category_id === currentCategory);
    const rest = others.filter((p) => p.category_id !== currentCategory);
    return [...same, ...rest];
  })();

  const items = pool.slice(0, props.limit);
  if (items.length === 0) return null;

  if (props.layout === "grid") {
    return (
      <Section>
        {heading && <SectionHeader title={heading} color="lilac" />}
        <div className="grid grid-cols-2 gap-bk-sm sm:gap-bk-md md:grid-cols-3 lg:grid-cols-4">
          {items.map((product, i) => (
            <SchneidersProductCard
              key={product.id}
              product={product}
              index={i}
              priority={i < 4}
              locale={locale}
            />
          ))}
        </div>
      </Section>
    );
  }

  return (
    <Section bleed className="py-bk-section">
      {heading && (
        <div className="px-4">
          <SectionHeader title={heading} color="lilac" />
        </div>
      )}
      <div className="flex gap-bk-sm overflow-x-auto px-4 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((product, i) => (
          <div
            key={product.id}
            className="shrink-0 snap-start w-[60%] sm:w-[40%] md:w-[30%] lg:w-[22%]"
          >
            <SchneidersProductCard
              product={product}
              index={i}
              priority={i < 4}
              locale={locale}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "pdp_related_products",
  category: "page",
  name: { en: "Related products", ar: "منتجات ذات صلة" },
  description: {
    en: "You-might-also-like products on the PDP, as a carousel or grid.",
    ar: "منتجات قد تعجبك على صفحة المنتج، شريط أو شبكة.",
  },
  thumbnail: "/sections/pdp_related_products.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpRelatedProductsRender,
};

registerSection(definition);
export default definition;
