// =====================================================================
// Section — product_grid
// =====================================================================
// 2-column grid of product cards with three sourcing modes:
//   - "auto"   — pulled from ctx.products via the configured query.
//   - "manual" — explicit list of product ids in display order.
//   - "mixed"  — pinned ids first, then auto-fill from the query.
// =====================================================================

import { z } from "zod";
import Image from "next/image";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import {
  BentoCard,
  MaterialIcon,
  Section,
  SectionHeader,
  Sticker,
} from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { SchneidersProductCard } from "./helpers/product-card";
import { FilterableProductGrid } from "./helpers/filterable-grid";
import { resolveTenantWhatsapp } from "./helpers/whatsapp";
import { formatPrice } from "./helpers/format";
import { cn } from "./helpers/utils";
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
  // ---- price_pill card style (all additions defaulted/optional so every
  // pre-existing stored config keeps parsing — and keeps rendering — exactly
  // as before) -----------------------------------------------------------
  /** "standard" = the original bento card grid (default, zero visual change).
   *  "price_pill" = soft rounded photo card, white price pill overlaid at the
   *  photo bottom, product name centered below the card. */
  card_style: z.enum(["standard", "price_pill"]).default("standard"),
  /** Small rounded chip rendered above the heading (price_pill header only). */
  eyebrow_i18n: i18nStringOptional,
  /** Muted line under the heading (price_pill header only). */
  subheading_i18n: i18nStringOptional,
  /** "See all" pill under the header (price_pill only) — hidden without a href. */
  see_all_label_i18n: i18nStringOptional,
  see_all_href: z.string().optional(),
  /** Decorative static 5-star row under each product name (price_pill only).
   *  Off by default — there is no per-product rating field on `Product`, so
   *  the row is purely visual and must be an explicit merchant opt-in. */
  show_stars: z.boolean().optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  mode: "auto",
  query: { sort: "newest", limit: 8 },
  manual_product_ids: [],
  pinned_product_ids: [],
  heading_i18n: { en: "Just dropped", ar: "وصل حديثاً" },
  scribble_color: "butter",
  card_style: "standard",
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

/* ---- price_pill card --------------------------------------------------- */

const FIVE_STARS = [0, 1, 2, 3, 4] as const;

/** Decorative static 5-star row (no rating data exists on `Product`). */
function StarRow() {
  return (
    <div
      aria-hidden="true"
      className="mt-1 flex items-center justify-center gap-0.5"
      style={{ color: "var(--bk-ink, #1a1a1a)" }}
    >
      {FIVE_STARS.map((i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3 w-3"
        >
          <path d="M10 1.7l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.32 5.06 16.91 6 11.41 2 7.51l5.53-.8L10 1.7z" />
        </svg>
      ))}
    </div>
  );
}

/**
 * Soft rounded product card ("price_pill" style): the photo fills a white
 * rounded card, a white pill overlays the photo bottom (bold sale price +
 * smaller struck compare-at), and the name sits centered BELOW the card.
 * Entirely brand-kit-token driven — no candy/bento chrome.
 */
function PricePillCard({
  product,
  locale,
  priority = false,
  showStars = false,
}: {
  product: Product;
  locale: LocaleCode;
  priority?: boolean;
  showStars?: boolean;
}) {
  const t = locale !== "en";
  const compareAt = product.compare_at_price;
  const onSale = compareAt != null && compareAt > product.price;
  const inStock =
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0) > 0;

  return (
    <StoreLink
      href={`/products/${product.slug ?? product.id}`}
      className="group block"
    >
      <div
        className="p-2"
        style={{
          backgroundColor: "var(--bk-surface, #ffffff)",
          borderRadius: "var(--bk-radius-card, 1.5rem)",
          boxShadow: "var(--bk-shadow-card, 0 8px 24px rgb(26 26 26 / 0.08))",
        }}
      >
        <div
          className="relative aspect-square overflow-hidden"
          style={{
            borderRadius: "calc(var(--bk-radius-card, 1.5rem) - 0.5rem)",
            backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
          }}
        >
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              priority={priority}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className={cn(
                "object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]",
                !inStock && "opacity-60 grayscale",
              )}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center font-bold text-sm uppercase text-bk-ink-faint">
              {t ? "لا توجد صورة" : "No image"}
            </div>
          )}
          {/* Price pill — bold sale price + smaller struck compare-at. */}
          <div className="absolute inset-x-0 bottom-2 flex justify-center px-2">
            <span
              className="inline-flex max-w-full items-baseline gap-1.5 rounded-full px-3 py-1.5"
              style={{
                backgroundColor: "var(--bk-surface, #ffffff)",
                boxShadow: "0 2px 8px rgb(26 26 26 / 0.12)",
              }}
            >
              <span
                className="whitespace-nowrap text-sm font-black"
                style={{
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                <bdi>{formatPrice(product.price, locale)}</bdi>
              </span>
              {onSale && (
                <span
                  className="whitespace-nowrap text-[11px] font-medium line-through"
                  style={{
                    color: "var(--bk-ink-soft, rgb(26 26 26 / 0.55))",
                    fontFamily: "var(--bk-font-body, inherit)",
                  }}
                >
                  <bdi>{formatPrice(compareAt, locale)}</bdi>
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
      <h3
        className="mt-bk-sm px-1 text-center text-sm font-bold leading-tight line-clamp-2 sm:text-base"
        style={{
          color: "var(--bk-ink, #1a1a1a)",
          fontFamily: "var(--bk-font-body, inherit)",
        }}
      >
        {product.name}
      </h3>
      {showStars && <StarRow />}
    </StoreLink>
  );
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

  // ---- price_pill branch ------------------------------------------------
  // Separate early return so the "standard" branch below stays byte-for-byte
  // identical for every existing store (card_style defaults to "standard").
  if (props.card_style === "price_pill") {
    const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
    const subheading = resolveI18n(props.subheading_i18n, locale);
    const seeAllLabel = resolveI18n(props.see_all_label_i18n, locale);
    // On a category page the grid is the full catalogue (the old-site
    // collection layout is a flat grid — no client-side filter bar).
    const pillItems = category ? ctx.products : items;

    return (
      <Section>
        {category ? (
          <div className="mb-bk-lg">
            <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft mb-bk-sm">
              <StoreLink href="/" className="hover:text-bk-primary">
                {t ? "الرئيسية" : "Home"}
              </StoreLink>
              <span className="text-bk-primary mx-1">›</span>
              {category.name}
            </p>
            <div
              className="flex flex-col items-center justify-center p-bk-lg text-center sm:p-bk-xl"
              style={{
                backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
                borderRadius: "var(--bk-radius-card, 1.5rem)",
              }}
            >
              <h1
                className="text-3xl font-black leading-tight sm:text-4xl"
                style={{
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                {category.name}
              </h1>
              {category.description && (
                <p
                  className="mt-bk-xs max-w-prose text-sm"
                  style={{
                    color: "var(--bk-ink-soft, rgb(26 26 26 / 0.6))",
                    fontFamily: "var(--bk-font-body, inherit)",
                  }}
                >
                  {category.description}
                </p>
              )}
            </div>
          </div>
        ) : (
          (eyebrow || heading || subheading || props.see_all_href) && (
            <div className="mb-bk-lg flex flex-col items-center gap-bk-sm text-center">
              {eyebrow && (
                <span
                  data-i18n-field="eyebrow_i18n"
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--bk-accent, #ffd84a) 12%, transparent)",
                    color: "var(--bk-ink, #1a1a1a)",
                    fontFamily: "var(--bk-font-body, inherit)",
                  }}
                >
                  {eyebrow}
                </span>
              )}
              {heading && (
                <h2
                  data-i18n-field="heading_i18n"
                  className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
                  style={{
                    color: "var(--bk-ink, #1a1a1a)",
                    fontFamily: "var(--bk-font-display, inherit)",
                  }}
                >
                  {heading}
                </h2>
              )}
              {subheading && (
                <p
                  data-i18n-field="subheading_i18n"
                  className="max-w-prose text-sm sm:text-base"
                  style={{
                    color: "var(--bk-ink-soft, rgb(26 26 26 / 0.6))",
                    fontFamily: "var(--bk-font-body, inherit)",
                  }}
                >
                  {subheading}
                </p>
              )}
              {props.see_all_href && (
                <StoreLink
                  href={props.see_all_href}
                  data-i18n-field="see_all_label_i18n"
                  className="mt-bk-xs inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-shadow hover:shadow-md"
                  style={{
                    backgroundColor: "var(--bk-surface, #ffffff)",
                    color: "var(--bk-ink, #1a1a1a)",
                    fontFamily: "var(--bk-font-body, inherit)",
                    boxShadow:
                      "var(--bk-shadow-card, 0 4px 16px rgb(26 26 26 / 0.08))",
                  }}
                >
                  <span className="underline underline-offset-4">
                    {seeAllLabel ?? (t ? "شوفهم كلهم" : "See all")}
                  </span>
                  <MaterialIcon name="arrow_forward" className="text-base" />
                </StoreLink>
              )}
            </div>
          )
        )}
        <div
          data-layer="cards"
          data-layer-label="Product cards"
          className="grid grid-cols-2 gap-bk-sm sm:gap-bk-md md:grid-cols-3 lg:grid-cols-4"
        >
          {pillItems.map((product, i) => (
            <PricePillCard
              key={product.id}
              product={product}
              locale={locale}
              priority={i < 4}
              showStars={props.show_stars === true}
            />
          ))}
        </div>
      </Section>
    );
  }

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
  valid_on: ["home", "category", "search", "checkout_success", "product"],
  schema,
  defaultProps,
  render: ProductGridRender,
};

registerSection(def);
export default def;
