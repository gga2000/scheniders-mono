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
  CenteredSectionHeader,
  MaterialIcon,
  Section,
  SectionHeader,
  Stars,
  Sticker,
} from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { SchneidersProductCard } from "./helpers/product-card";
import { FilterableProductGrid } from "./helpers/filterable-grid";
import { RevealMore } from "./helpers/reveal-more";
import { resolveTenantWhatsapp } from "./helpers/whatsapp";
import { chromeString } from "./helpers/chrome-strings";
import {
  formatPrice,
  formatCount,
  discountPercent,
  formatPercent,
  formatSavings,
} from "./helpers/format";
import { cn, PRESSABLE } from "./helpers/utils";
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
      /**
       * Drop products with nothing left to sell. Opt-in: a category page
       * whose stock is all gone still wants to show its products.
       */
      exclude_out_of_stock: z.boolean().optional(),
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
   *  "price_pill" = soft rounded photo card, surface price pill overlaid at
   *  the photo bottom, product name centered below the card. */
  card_style: z.enum(["standard", "price_pill"]).default("standard"),
  /** Small rounded chip rendered above the heading (price_pill header only). */
  eyebrow_i18n: i18nStringOptional,
  /** Muted line under the heading (price_pill header only). */
  subheading_i18n: i18nStringOptional,
  /** "See all" pill after the grid (price_pill only) — hidden without a href. */
  see_all_label_i18n: i18nStringOptional,
  see_all_href: z.string().optional(),
  /** Star row under each product name (price_pill only). Off by default.
   *  When on, it renders the product's REAL approved-review average rating
   *  plus a small "(N)" count — and only for products that actually have
   *  reviews (products without `review_count` show no stars at all). */
  show_stars: z.boolean().optional(),
  /** Percentage-off chip on the photo, for products with a real saving. */
  show_discount_badge: z.boolean().optional(),
  /**
   * Badge a product at or below this many units remaining. Unset means no
   * badge. Real stock only — a sold-out or oversold product is excluded
   * from the grid, never badged.
   */
  low_stock_threshold: z.number().int().positive().optional(),
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

function selectAuto(
  products: Product[],
  query: Props["query"],
  excludeId?: string,
): Product[] {
  // P1-17: a PDP cross-sell must never offer the product being viewed.
  let pool = excludeId
    ? products.filter((p) => p.id !== excludeId)
    : products.slice();
  if (query?.category_slug) {
    // No slug field on Product — best-effort match on category_id-as-slug
    // (storefront populates category lookups upstream so this is mostly a
    // pass-through; refining belongs in the data layer, not here).
    pool = pool.filter((p) => p.category_id === query.category_slug);
  }
  if (query?.exclude_out_of_stock) {
    const buyable = pool.filter(
      (p) => (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0) > 0,
    );
    // Never let the filter empty a grid — this section also renders on
    // category, product and checkout_success pages.
    if (buyable.length > 0) pool = buyable;
  }
  if (query?.sort === "sale") {
    pool = pool.filter(
      (p) => p.compare_at_price != null && p.compare_at_price > p.price,
    );
  } else if (query?.sort === "bestsellers") {
    // P2-6: real sales rank first (1 = best seller over the trailing 180
    // days of fulfilled orders, maintained in the database), then the
    // merchandising flag, then the merchant's display_order for everything
    // that never sold. Unranked products sort after ranked ones instead of
    // ahead of them, so a heading that claims "best sellers" shows the
    // products that actually sold.
    const rank = (p: Product) =>
      typeof p.bestseller_rank === "number" && p.bestseller_rank > 0
        ? p.bestseller_rank
        : Number.POSITIVE_INFINITY;
    pool.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.is_bestseller ?? false) - Number(a.is_bestseller ?? false) ||
        (a.display_order ?? 0) - (b.display_order ?? 0),
    );
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

/**
 * Exported so a page can emit structured data for EXACTLY the products
 * this grid renders. Re-deriving that list in the page is how a schema
 * block ends up describing a different set than the one on screen.
 */
export function selectProducts(
  props: Props,
  ctx: SectionRenderContext,
): Product[] {
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
      ctx.product?.id,
    );
    const limit = props.query?.limit ?? Infinity;
    return [...pinned, ...fill].slice(0, limit);
  }
  return selectAuto(ctx.products, props.query, ctx.product?.id);
}

/** Localised "N products" for the category hero count sticker. */
function productCountLabel(count: number, locale: LocaleCode): string {
  return formatCount(count, locale, {
    one: locale === "en" ? "1 product" : "منتج واحد",
    two: "منتجان",
    few: "{count} منتجات",
    many: "{count} منتجاً",
    other: locale === "en" ? "{count} products" : "{count} منتج",
  });
}

/* ---- price_pill card --------------------------------------------------- */

/** Real per-product rating row: the shared `Stars` primitive filled to the
 *  rounded average of the product's approved reviews + a small "(N)" review
 *  count. Callers only render it when `review_count > 0` — never as
 *  decoration. */
function StarRow({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="mt-1 flex items-center justify-start gap-1">
      <Stars value={rating} size={12} label={`${rating.toFixed(1)} / 5`} />
      <span
        className="text-[11px] font-medium tabular-nums"
        style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.55))" }}
      >
        ({count})
      </span>
    </div>
  );
}

/**
 * Product card — editorial plate.
 *
 * The photograph is never covered. On a perfume store the bottle IS the
 * product, and the previous layout floated a price pill across the bottom
 * of every one of them: legibility depended on whatever the photo happened
 * to be, and the thing being sold was obscured.
 *
 * Below the photo the three numbers read as one thought — what you pay, the
 * price struck through, and what that saves you in dinars. The saving used
 * to be stated twice in two disconnected places (a percent chip floating on
 * the photo, a struck price inside the pill) and never in money, which is
 * the figure a shopper actually weighs.
 *
 * The name takes the display face: it is the product, not a caption.
 * Entirely brand-kit-token driven — no candy/bento chrome.
 */
export function PricePillCard({
  product,
  locale,
  priority = false,
  showStars = false,
  showDiscountBadge = false,
  lowStockThreshold,
}: {
  product: Product;
  locale: LocaleCode;
  priority?: boolean;
  showStars?: boolean;
  showDiscountBadge?: boolean;
  lowStockThreshold?: number;
}) {
  const t = locale !== "en";
  const compareAt = product.compare_at_price;
  const onSale = compareAt != null && compareAt > product.price;
  const inStock =
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0) > 0;
  // One definition of "on sale", shared with the hero offer chip, so a
  // card and the hero can never disagree about a saving.
  // `showDiscountBadge` decides whether to PAINT the marker, never whether a
  // discount exists — the saving line below reads the same value, so the two
  // can never contradict each other about the same product.
  const pct = discountPercent(product.price, compareAt);
  const saved =
    pct != null && compareAt != null
      ? formatSavings(compareAt, product.price, locale)
      : null;
  const remaining =
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0);
  // A sold-out or oversold product is excluded from the grid, never
  // badged — and a negative remainder must never reach the page.
  const lowStock =
    lowStockThreshold != null && remaining > 0 && remaining <= lowStockThreshold
      ? remaining
      : null;

  return (
    <StoreLink
      href={`/products/${product.slug ?? product.id}`}
      className={cn("group block", PRESSABLE)}
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
                "object-cover transition-transform duration-300 ease-out motion-reduce:transition-none group-hover:scale-[1.04]",
                !inStock && "opacity-60 grayscale",
              )}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center font-bold text-sm bk-caps text-bk-ink-faint">
              {t ? "لا توجد صورة" : "No image"}
            </div>
          )}
          {/* Sold-out chip — greying the photo alone was too subtle. */}
          {!inStock && (
            <span
              className="absolute start-2 top-2 inline-flex items-center px-2.5 py-1 font-label text-[11px] font-bold"
              style={{
                backgroundColor: "var(--bk-ink, #1a1a1a)",
                color: "var(--bk-surface, #ffffff)",
                borderRadius: "var(--bk-radius-pill, 9999px)",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
            >
              {t ? "نفد المخزون" : "Sold out"}
            </span>
          )}
          {showDiscountBadge && pct != null && (
            // Ink, not the buy-yellow: the marker states a fact about the
            // price. The yellow means "act" and is spent on the CTA.
            <span
              className="absolute top-3 start-3 z-10 inline-flex items-center px-2.5 py-1 font-label text-[11px] font-bold tabular-nums"
              style={{
                backgroundColor: "var(--bk-ink, #1a1a1a)",
                color: "var(--bk-surface, #ffffff)",
                borderRadius: "var(--bk-radius-pill, 9999px)",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
            >
              <bdi>{formatPercent(pct, locale)}</bdi>
            </span>
          )}
        </div>
      </div>
      <h3
        // `line-clamp-2` caps the name at two lines but reserves nothing, so
        // a short name (ايبسكو) sat a full line higher than a long one and the
        // row went ragged again — 17px apart at 390px. `min-h` of two lines
        // holds the space; em-based so it follows the size change at `sm`.
        //
        // Display face, start-aligned: the name is the product, not a
        // caption under a picture.
        className="mt-bk-sm px-1 text-start text-[15px] font-semibold leading-snug tracking-[-0.01em] line-clamp-2 min-h-[2.5em] text-balance sm:text-base"
        style={{
          color: "var(--bk-ink, #1a1a1a)",
          fontFamily: "var(--bk-font-display, inherit)",
        }}
      >
        {product.name}
      </h3>
      {/* The price line. What you pay leads; the old price follows it,
          struck and quiet. Baseline-aligned so the two sit on one line
          instead of reading as two separate facts. */}
      <div
        data-price-line
        className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1"
      >
        <span
          className="whitespace-nowrap text-base font-bold tabular-nums sm:text-lg"
          style={{
            color: "var(--bk-ink, #1a1a1a)",
            fontFamily: "var(--bk-font-display, inherit)",
          }}
        >
          <bdi>{formatPrice(product.price, locale)}</bdi>
        </span>
        {onSale && (
          <span
            data-compare-at
            className="whitespace-nowrap text-xs font-medium line-through tabular-nums"
            style={{
              // ink-soft, not ink-faint: at 0.38 alpha the struck price
              // measured 2.04:1 on the card and the saving simply did not
              // register. The discount has to be readable to land.
              color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
              fontFamily: "var(--bk-font-body, inherit)",
            }}
          >
            <bdi>{formatPrice(compareAt, locale)}</bdi>
          </span>
        )}
      </div>
      {/* What the sale is worth, in money. "24٪" is abstract; "وفّر 11,750
          د.ع" is the number a shopper actually weighs. Same two inputs as
          the percent marker, so the card cannot contradict itself. */}
      {saved != null && (
        <p
          data-saving
          className="mt-1 px-1 font-body text-xs font-semibold"
          style={{
            // Full ink, quiet by size rather than by fade. --bk-accent
            // measured 1.75:1 here (it is the brand yellow, on a near-white
            // card) and it belongs to acting, not to stating a fact.
            color: "var(--bk-ink, #1a1a1a)",
            fontFamily: "var(--bk-font-body, inherit)",
          }}
        >
          {chromeString("save_prefix", locale)} <bdi>{saved}</bdi>
        </p>
      )}
      {/* Always rendered, even when empty: two cards with a star row and
          four without is four objects, not one shelf. */}
      <div
        data-meta-row
        // 22px, not 20: the star row measures 21px, so a 20px floor let the
        // two cards that have reviews grow 1px taller than the other four —
        // the exact raggedness this row exists to remove. Measured at 1512.
        className="mt-1 flex min-h-[22px] items-center justify-start px-1"
      >
        {showStars && (product.review_count ?? 0) > 0 ? (
          <StarRow
            rating={product.avg_rating ?? 0}
            count={product.review_count ?? 0}
          />
        ) : lowStock != null ? (
          <span
            data-low-stock
            className="font-body text-xs font-semibold"
            style={{
              color: "var(--bk-danger, #e2574c)",
              fontFamily: "var(--bk-font-body, inherit)",
            }}
          >
            {locale === "en" ? (
              <>only <bdi>{lowStock}</bdi> left</>
            ) : (
              <>باقي <bdi>{lowStock}</bdi> بس</>
            )}
          </span>
        ) : null}
      </div>
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

  // `priority` preloads an image and competes with the hero for bandwidth
  // (the home page was preloading 7). Only the first two cards get it, and
  // only where the grid is the page's lead content — category and search
  // pages open on the grid; home / PDP / thank-you have a hero or buy box
  // above it. (Sections don't receive their index from RenderPage.)
  const leadSection = Boolean(category) || ctx.runtime.page_id === "search";
  const cardPriority = (i: number) => leadSection && i < 2;

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
    // collection layout is a flat grid — no client-side filter bar). P2-5:
    // `query.limit` caps the first paint; the rest reveals on "show more".
    const pillItems = category ? ctx.products : items;
    const pageSize = props.query?.limit;
    const gridCls =
      "grid grid-cols-2 gap-bk-sm sm:gap-bk-md md:grid-cols-3 lg:grid-cols-4";
    const cards = pillItems.map((product, i) => (
      <PricePillCard
        key={product.id}
        product={product}
        locale={locale}
        priority={cardPriority(i)}
        showStars={props.show_stars === true}
        showDiscountBadge={props.show_discount_badge === true}
        lowStockThreshold={props.low_stock_threshold}
      />
    ));

    return (
      <Section>
        {category ? (
          <div className="mb-bk-lg">
            <p className="font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft mb-bk-sm">
              <StoreLink
                href="/"
                // P3-12: 44px-tall hit area via padding, not font size.
                className={cn(
                  "inline-flex min-h-11 items-center px-1 -mx-1 hover:text-bk-primary",
                  PRESSABLE,
                )}
              >
                {chromeString("home", locale)}
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
                className="text-bk-h1 font-black text-balance"
                style={{
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                {category.name}
              </h1>
              {category.description && (
                <p
                  className="mt-bk-xs max-w-prose text-sm text-pretty"
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
          (eyebrow || heading || subheading) && (
            <CenteredSectionHeader
              eyebrow={eyebrow}
              title={heading}
              subtitle={subheading}
              glyph="sparkle"
              eyebrowField="eyebrow_i18n"
              titleField="heading_i18n"
              subtitleField="subheading_i18n"
            />
          )
        )}
        {category && pageSize && pillItems.length > pageSize ? (
          <div data-layer="cards" data-layer-label="Product cards">
            <RevealMore
              initial={pageSize}
              label={t ? "عرض المزيد" : "Show more"}
              className={gridCls}
            >
              {cards}
            </RevealMore>
          </div>
        ) : (
          <div
            data-layer="cards"
            data-layer-label="Product cards"
            className={gridCls}
          >
            {cards}
          </div>
        )}
        {/* "See all" lands after the cards: the natural next step once the
            shopper has scanned the curated set. */}
        {!category && props.see_all_href && (
          <div className="mt-bk-lg flex justify-center">
            <StoreLink
              href={props.see_all_href}
              data-i18n-field="see_all_label_i18n"
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2 text-sm font-bold",
                PRESSABLE,
              )}
              style={{
                backgroundColor: "var(--bk-surface, #ffffff)",
                color: "var(--bk-ink, #1a1a1a)",
                fontFamily: "var(--bk-font-body, inherit)",
                boxShadow:
                  "var(--bk-shadow-card, 0 4px 16px rgb(26 26 26 / 0.08))",
              }}
            >
              <span className="underline underline-offset-4">
                {seeAllLabel ?? chromeString("see_all", locale)}
              </span>
              <MaterialIcon name="arrow_forward" className="text-base" />
            </StoreLink>
          </div>
        )}
      </Section>
    );
  }

  return (
    <Section>
      {category ? (
        <>
          <div className="mb-bk-lg">
            <p className="font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft mb-bk-sm">
              <StoreLink
                href="/"
                // P3-12: 44px-tall hit area via padding, not font size.
                className={cn(
                  "inline-flex min-h-11 items-center px-1 -mx-1 hover:text-bk-primary",
                  PRESSABLE,
                )}
              >
                {chromeString("home", locale)}
              </StoreLink>
              <span className="text-bk-primary mx-1">›</span>
              {category.name}
            </p>
            <BentoCard
              bg="mint"
              size="md"
              rotate={1}
              className="p-bk-lg sm:p-bk-xl"
            >
              <Sticker bg="pink" rotate={-4} size="xs" className="mb-bk-sm">
                {t ? "اكتشف المجموعة" : "Step into color"}
              </Sticker>
              <h1 className="font-display font-black text-bk-h1 bk-caps text-balance">
                {category.name}
              </h1>
              {category.description && (
                <p className="font-body font-bold text-sm mt-bk-xs max-w-[85%] text-pretty">
                  {category.description}
                </p>
              )}
              <div className="mt-bk-md">
                <Sticker
                  bg="butter"
                  rotate={3}
                  size="xs"
                  className="tabular-nums"
                >
                  {productCountLabel(catCount, locale)}
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
            <SectionHeader
              title={heading}
              color={props.scribble_color ?? "butter"}
            />
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
                priority={cardPriority(i)}
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
