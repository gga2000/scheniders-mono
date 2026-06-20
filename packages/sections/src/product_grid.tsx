// =====================================================================
// Section — product_grid
// =====================================================================
// 2-column grid of product cards with three sourcing modes:
//   - "auto"   — pulled from ctx.products via the configured query.
//   - "manual" — explicit list of product ids in display order.
//   - "mixed"  — pinned ids first, then auto-fill from the query.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  Section,
  SectionHeader,
  Sticker,
} from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { SchneidersProductCard } from "./helpers/product-card";
import { FilterableProductGrid } from "./helpers/filterable-grid";
import { resolveTenantWhatsapp } from "./helpers/whatsapp";
import type { Product } from "./types";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const scribbleColor = z.enum(["butter", "mint", "lilac", "sky", "pink"]);

const schema = z.object({
  mode: z.enum(["auto", "manual", "mixed"]),
  query: z
    .object({
      sort: z.enum(["newest", "bestsellers", "sale"]).optional(),
      category_slug: z.string().optional(),
      limit: z.number().int().positive().optional(),
    })
    .optional(),
  manual_product_ids: z.array(z.string()).optional(),
  pinned_product_ids: z.array(z.string()).optional(),
  heading_i18n: i18nStringOptional,
  scribble_color: scribbleColor.optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  mode: "auto",
  query: { sort: "newest", limit: 8 },
  manual_product_ids: [],
  pinned_product_ids: [],
  heading_i18n: { en: "Just dropped", ar: "وصل حديثاً" },
  scribble_color: "butter",
};

/* ---- product selection ------------------------------------------------ */

function selectAuto(products: Product[], query: Props["query"]): Product[] {
  let pool = products.slice();
  if (query?.category_slug) {
    // No slug field on Product — best-effort match on category_id-as-slug
    // (storefront populates category lookups upstream so this is mostly a
    // pass-through; refining belongs in the data layer, not here).
    pool = pool.filter((p) => p.category_id === query.category_slug);
  }
  if (query?.sort === "sale") {
    pool = pool.filter(
      (p) => p.compare_at_price != null && p.compare_at_price > p.price,
    );
  } else if (query?.sort === "bestsellers") {
    // No "sold count" field — fall back to display_order ascending.
    pool.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  } else {
    // newest — created_at descending; fall back to id order.
    pool.sort((a, b) => {
      const at = (a as Product & { created_at?: string }).created_at ?? "";
      const bt = (b as Product & { created_at?: string }).created_at ?? "";
      return bt.localeCompare(at);
    });
  }
  if (query?.limit && pool.length > query.limit) {
    pool = pool.slice(0, query.limit);
  }
  return pool;
}

function selectProducts(props: Props, ctx: SectionRenderContext): Product[] {
  const byId = new Map(ctx.products.map((p) => [p.id, p]));
  if (props.mode === "manual") {
    return (props.manual_product_ids ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is Product => !!p);
  }
  if (props.mode === "mixed") {
    const pinned = (props.pinned_product_ids ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is Product => !!p);
    const pinnedIds = new Set(pinned.map((p) => p.id));
    const fill = selectAuto(
      ctx.products.filter((p) => !pinnedIds.has(p.id)),
      props.query,
    );
    const limit = props.query?.limit ?? Infinity;
    return [...pinned, ...fill].slice(0, limit);
  }
  return selectAuto(ctx.products, props.query);
}

/* ---- render ----------------------------------------------------------- */

function ProductGridRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const items = selectProducts(props, ctx);
  const heading = resolveI18n(props.heading_i18n, ctx.runtime.locale);
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  // On a category landing page, lead with a mint category hero (breadcrumb +
  // eyebrow sticker + big name + count) instead of the plain section heading.
  const category = ctx.category;
  const catCount = category ? ctx.products.length : 0;

  // On a category page the grid is the full category catalogue (filterable +
  // paginated client-side); on the home/curated case it's the limited query.
  if ((category ? ctx.products.length : items.length) === 0) return null;

  return (
    <Section>
      {category ? (
        <>
          <div className="mb-bk-lg">
            <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft mb-bk-sm">
              <StoreLink href="/" className="hover:text-bk-primary">
                {t ? "الرئيسية" : "Home"}
              </StoreLink>
              <span className="text-bk-primary mx-1">›</span>
              {category.name}
            </p>
            <BentoCard bg="mint" size="md" rotate={1} className="p-bk-lg sm:p-bk-xl">
              <Sticker bg="pink" rotate={-4} size="xs" className="mb-bk-sm">
                {t ? "اكتشف المجموعة" : "Step into color"}
              </Sticker>
              <h1 className="font-display font-black text-3xl sm:text-4xl uppercase leading-tight">
                {category.name}
              </h1>
              {category.description && (
                <p className="font-body font-bold text-sm mt-bk-xs max-w-[85%]">
                  {category.description}
                </p>
              )}
              <div className="mt-bk-md">
                <Sticker bg="butter" rotate={3} size="xs">
                  {t ? `${catCount} منتج` : `${catCount} product${catCount === 1 ? "" : "s"}`}
                </Sticker>
              </div>
            </BentoCard>
          </div>
          <FilterableProductGrid
            products={ctx.products}
            locale={locale}
            whatsappPhone={resolveTenantWhatsapp(ctx.tenant)}
          />
        </>
      ) : (
        <>
          {heading && (
            <SectionHeader title={heading} color={props.scribble_color ?? "butter"} />
          )}
          <div
            data-layer="cards"
            data-layer-label="Product cards"
            className="grid grid-cols-2 gap-bk-sm sm:gap-bk-md md:grid-cols-3 lg:grid-cols-4"
          >
            {items.map((product, i) => (
              <SchneidersProductCard
                key={product.id}
                product={product}
                index={i}
                priority={i < 4}
                whatsappPhone={resolveTenantWhatsapp(ctx.tenant)}
                locale={ctx.runtime.locale}
              />
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

const def: SectionDefinition<Props> = {
  type: "product_grid",
  category: "products",
  name: { en: "Product grid", ar: "شبكة منتجات" },
  description: {
    en: "2-column grid of product cards. Auto-query, manual list, or mix.",
    ar: "شبكة منتجات بعمودين، آلية أو يدوية أو مزيج.",
  },
  thumbnail: "/sections/product_grid.svg",
  valid_on: ["home", "category", "search", "checkout_success"],
  schema,
  defaultProps,
  render: ProductGridRender,
};

registerSection(def);
export default def;
