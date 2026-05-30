// =====================================================================
// Section — pdp_related_products
// =====================================================================
// "You might also like" horizontal carousel for the PDP. Sources from
// ctx.relatedProducts when it exists, otherwise falls back to
// ctx.products with the current product filtered out. Renders nothing
// when no products are available.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { ScribbleHeading } from "./helpers/primitives";
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
    // Prefer same-category products first, then anything else.
    const same = others.filter((p) => p.category_id === currentCategory);
    const rest = others.filter((p) => p.category_id !== currentCategory);
    return [...same, ...rest];
  })();

  const items = pool.slice(0, props.limit);
  if (items.length === 0) return null;

  if (props.layout === "grid") {
    return (
      <section className="px-4 py-8">
        {heading && (
          <ScribbleHeading color="lilac" className="mb-5">
            {heading}
          </ScribbleHeading>
        )}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {items.map((product, i) => (
            <SchneidersProductCard
              key={product.id}
              product={product}
              index={i}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="py-8">
      {heading && (
        <div className="px-4 mb-5">
          <ScribbleHeading color="lilac">{heading}</ScribbleHeading>
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto px-4 snap-x snap-mandatory scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((product, i) => (
          <div
            key={product.id}
            className="shrink-0 snap-start w-[60%] sm:w-[40%] md:w-[30%]"
          >
            <SchneidersProductCard product={product} index={i} />
          </div>
        ))}
      </div>
    </section>
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
