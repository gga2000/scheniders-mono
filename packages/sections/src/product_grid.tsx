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
import { CatalogGrid } from "./helpers/catalog-grid";
import { resolveTenantWhatsapp } from "./helpers/whatsapp";
import { chromeString } from "./helpers/chrome-strings";
import { isBuyable } from "./helpers/stock";
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
      /**
       * Keep sold-out products, but after every product a shopper can
       * order. Applied before `limit`, so a sold-out best seller gives its
       * slot to something orderable instead of leading the shelf. Opt-in:
       * unset leaves today's order untouched. `.catch` so a malformed
       * stored value reads as unset rather than dropping the section.
       */
      sold_out_last: z.boolean().optional().catch(undefined),
    })
    .optional(),
  manual_product_ids: z.array(z.string()).optional(),
  pinned_product_ids: z.array(z.string()).optional(),
  heading_i18n: i18nStringOptional,
  /**
   * Offer attribute facets above the grid. Optional: a stored instance
   * from before this existed must still parse, or the section is
   * silently dropped at render.
   *
   * A real category page turns them on regardless — a merchant browsing
   * a category expects to narrow it. Off elsewhere so the home grid
   * stays server-rendered and ships no filtering JavaScript.
   */
  enable_filters: z.boolean().optional(),
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
  /**
   * Full-catalogue mode (price_pill only): category chips with live counts,
   * sort, a median-derived price split and load-more, over everything
   * loaded. Unset leaves today's markup byte-identical, including the
   * existing category-page reveal branch. The "standard" card style has its
   * own FilterableProductGrid on category pages and is left alone.
   */
  /**
   * A rail of category shortcuts above the grid, each linking into the
   * catalogue already filtered. A shelf of six products is a sample; this
   * is how a shopper gets from it to the rest of the shop.
   */
  show_category_links: z.boolean().optional(),
  /** How many shortcuts to show. Defaults to 6. */
  category_links_limit: z.number().int().positive().optional(),
  catalog_controls: z.boolean().optional(),
  /**
   * A search field above the catalogue controls. Worth it once a shopper
   * cannot see the whole shelf at a glance; a six-product grid does not
   * need one, so it is opt-in rather than implied by `catalog_controls`.
   */
  catalog_search: z.boolean().optional(),
  /** Cards revealed per page in catalogue mode. Defaults to 12. */
  catalog_page_size: z.number().int().positive().optional(),
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
  enable_filters: false,
  scribble_color: "butter",
  card_style: "standard",
};

/* ---- product selection ------------------------------------------------ */

/** Stable partition: orderable products first, sold-out and oversold ones
 *  after, each half in the order it arrived. */
function soldOutLast(products: Product[]): Product[] {
  return [
    ...products.filter((p) => isBuyable(p)),
    ...products.filter((p) => !isBuyable(p)),
  ];
}

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
  if (query?.sold_out_last) pool = soldOutLast(pool);
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
    const manual = (props.manual_product_ids ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is Product => !!p);
    return props.query?.sold_out_last ? soldOutLast(manual) : manual;
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
    const merged = [...pinned, ...fill];
    return (props.query?.sold_out_last ? soldOutLast(merged) : merged).slice(0, limit);
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
/**
 * Rating: one star, the real average, and how many people said so.
 *
 * Five stars were rounded to the nearest whole — `Stars` says so in its own
 * doc — so 4.6 and 5.0 both painted five filled stars and the card
 * overstated the product by up to half a star. This tenant's two rated
 * perfumes are 4.7 and 4.6; both showed five.
 *
 * Printing the number instead is honest and smaller, and it stops five
 * accent-coloured shapes competing with the accent-coloured discount seal
 * two lines above them.
 */
function StarRow({ rating, count }: { rating: number; count: number }) {
  return (
    // No top margin: the meta row that holds this already has its own, and
    // a second one made the star row start 4px higher than the low-stock
    // line beside it — the row stopped lining up across the shelf.
    <div className="flex items-center justify-start gap-1">
      {/* max=1 — a single glyph, not a five-star gauge. */}
      <Stars value={1} max={1} size={13} label={`${rating.toFixed(1)} / 5`} />
      <span
        data-rating-value
        className="text-[12px] font-bold leading-none tabular-nums"
        style={{
          color: "var(--bk-ink, #1a1a1a)",
          fontFamily: "var(--bk-font-body, inherit)",
        }}
      >
        <bdi>{rating.toFixed(1)}</bdi>
      </span>
      <span
        className="text-[11px] font-medium leading-none tabular-nums"
        style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.55))" }}
      >
        <bdi>({count})</bdi>
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
  // formatPercent owns the locale's sign ("٪" / "%"), and the seal prints
  // what it returns verbatim — the sign never gets re-derived by hand.
  const pctText = pct != null ? formatPercent(pct, locale) : "";
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
      {/* One surface. The photo used to be a card and the words loose text
          underneath it, which read as a caption dangling from a picture
          rather than as one object you can click. */}
      <article
        className={cn(
          "flex h-full flex-col overflow-hidden",
          // The whole plate lifts on hover, not just the photo inside it —
          // the card is one object, so it should answer as one.
          "transition-transform duration-300 ease-out group-hover:-translate-y-1",
          "motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
        )}
        style={{
          backgroundColor: "var(--bk-surface, #ffffff)",
          borderRadius: "var(--bk-radius-card, 1.5rem)",
          boxShadow: "var(--bk-shadow-card, 0 8px 24px rgb(26 26 26 / 0.08))",
        }}
      >
        <div
          data-photo
          className="relative aspect-square overflow-hidden"
          style={{
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
                "object-cover transition-transform duration-bk-base ease-out motion-reduce:transition-none group-hover:scale-[1.04]",
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
            // A seal, not a footnote. The saving is the most persuasive fact
            // on the card and it used to be the smallest text on it (11px).
            // The number carries the weight; the sign is a small rider.
            <span
              data-discount-seal
              className="absolute top-3 start-3 z-10 inline-flex flex-col items-center justify-center leading-none tabular-nums"
              style={{
                backgroundColor: "var(--bk-accent, #fbb82e)",
                color: "var(--bk-ink, #1a1a1a)",
                borderRadius: "var(--bk-radius-pill, 9999px)",
                fontFamily: "var(--bk-font-display, inherit)",
                width: "3rem",
                height: "3rem",
                gap: "1px",
                boxShadow: "var(--bk-shadow-button, 0 2px 8px rgb(26 26 26 / 0.18))",
              }}
            >
              <span className="text-[9px] font-bold uppercase opacity-75">
                {chromeString("discount_label", locale)}
              </span>
              {/* Number and sign in ONE run. Split across two lines the sign
                  floated loose under the figure and read as a stray glyph —
                  and this project has already had to fix a percent sign
                  separated from its number once, in the hero badge. */}
              <bdi className="text-[15px] font-black">{pctText}</bdi>
            </span>
          )}
          {/* Scrim + name. Moving the name onto the photograph is what makes
              the price hierarchy solvable: the well below stops being shared
              between an identity and a number, and can give the price the
              size it needs. The gradient is built from the ink token so it
              follows the kit, and it reads as a plinth under the bottle
              rather than a band across it. */}
          <div
            data-scrim
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
            style={{
              backgroundImage:
                // The name can wrap to two lines, so the upper line must be
                // legible too. At a 55% mid-stop it measured 2.85:1 against
                // a bright photo; these stops hold the whole name box above
                // 4.5:1 whatever the photograph underneath is doing.
                "linear-gradient(to top, color-mix(in srgb, var(--bk-ink, #1a1a1a) 94%, transparent), color-mix(in srgb, var(--bk-ink, #1a1a1a) 80%, transparent) 45%, color-mix(in srgb, var(--bk-ink, #1a1a1a) 38%, transparent) 72%, transparent)",
            }}
          />
          <h3
            // Two lines, clamped and reserved, so a long name never pushes
            // the scrim past the bottle. Sitting on the photo it no longer
            // affects card height at all — the plate is the photo plus a
            // fixed price well, so rows cannot go ragged.
            className="absolute inset-x-0 bottom-0 z-10 px-3 pb-3 text-start text-[15px] font-semibold leading-snug tracking-[-0.01em] line-clamp-2 text-balance sm:text-base"
            style={{
              color: "var(--bk-surface, #ffffff)",
              fontFamily: "var(--bk-font-display, inherit)",
              textShadow: "0 1px 2px color-mix(in srgb, var(--bk-ink, #1a1a1a) 55%, transparent)",
            }}
          >
            {product.name}
          </h3>
        </div>

        {/* The well now carries one thing: what this costs. */}
        <div
          className="flex flex-1 flex-col px-3 pb-2.5 pt-2.5"
          style={{ borderTop: "1px solid var(--bk-divider, rgb(26 26 26 / 0.08))" }}
        >
          {/* Two columns, each captioned. The numbers used to differ only
              by size, so a shopper had to decode which was which from
              typography alone — a strike-through is a convention, not a
              statement. Now the card says it outright. */}
          {/* The price sits on its own plate. A warm tint lifted off the
              surface token, with a soft accent wash rising from the bottom
              corner — enough to separate the money from the name above and
              the rating below without another hairline. */}
          <div
            data-price-plate
            className="relative -mx-1 px-1 pb-1 pt-1.5"
            style={{
              // Texture, no container and no fade. A fine dot matrix drawn
              // from the ink token — the grain of good paper rather than a
              // panel dropped behind the numbers. Even across the whole
              // block: a masked version read as a gradient, which is a
              // different effect from a texture.
              backgroundImage:
                "radial-gradient(color-mix(in srgb, var(--bk-ink, #1a1a1a) 12%, transparent) 0.8px, transparent 0.9px)",
              backgroundSize: "7px 7px",
            }}
          >
          <div
            data-price-line
            // Adjacent, not pushed to opposite edges. `justify-between`
            // threw the old price at the far side of the card, where it read
            // as a separate fact rather than the thing the new price is
            // being compared against.
            className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4 sm:gap-y-1"
          >
            <div className="flex flex-col gap-0.5">
              <span
                data-price-caption
                className="font-body text-[10px] font-semibold tracking-wide"
                style={{
                  // Green for what you pay, red for what you would have.
                  // Both are DARKENED against the ink token first: raw
                  // --bk-success measured 1.89:1 on this card and raw
                  // --bk-danger 3.48:1, neither readable at these sizes.
                  // Mixed against the PLATE the block sits on, not the card:
                  // the plate is rgb(248,239,223) where the card is
                  // rgb(253,248,239), and the darker ground cost about a
                  // third of a point. At 45%/75% the captions measured
                  // 4.21 and 4.22 here, under the 4.5 floor for small text.
                  color: onSale ? "color-mix(in srgb, var(--bk-success, #3ecf8e) 38%, var(--bk-ink, #1a1a1a))" : "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
                  fontFamily: "var(--bk-font-body, inherit)",
                }}
              >
                {chromeString(
                  onSale ? "price_after_discount" : "price_label",
                  locale,
                )}
              </span>
              <span
                className="whitespace-nowrap text-xl font-black leading-none tabular-nums"
                style={{
                  color: onSale ? "color-mix(in srgb, var(--bk-success, #3ecf8e) 38%, var(--bk-ink, #1a1a1a))" : "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                <bdi>{formatPrice(product.price, locale)}</bdi>
              </span>
            </div>
            {onSale && (
              // Caption above its value, exactly like the paid price beside
              // it. Trailing the number instead made the two captions relate
              // to their figures differently, which is what stopped the
              // block reading as one comparison.
              <div className="flex items-baseline gap-1.5 sm:flex-col sm:items-start sm:gap-0.5">
                <span
                  data-price-caption
                  className="font-body text-[10px] font-semibold tracking-wide"
                  style={{
                    color: "color-mix(in srgb, var(--bk-danger, #e2574c) 65%, var(--bk-ink, #1a1a1a))",
                    fontFamily: "var(--bk-font-body, inherit)",
                  }}
                >
                  {chromeString("price_before_discount", locale)}
                </span>
                <span
                  data-compare-at
                  className="whitespace-nowrap text-xs font-medium leading-none line-through tabular-nums"
                  style={{
                    color: "color-mix(in srgb, var(--bk-danger, #e2574c) 65%, var(--bk-ink, #1a1a1a))",
                    fontFamily: "var(--bk-font-body, inherit)",
                  }}
                >
                  <bdi>{formatPrice(compareAt, locale)}</bdi>
                </span>
              </div>
            )}
          </div>
          {/* What the sale is worth, in money — the same two inputs as the
              seal, so the card cannot contradict itself. */}
          {saved != null && (
            <span
              data-saving
              className="mt-2 inline-flex w-fit items-center gap-1 px-2 py-0.5 font-body text-[11px] font-semibold"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--bk-accent, #fbb82e) 18%, transparent)",
                color: "var(--bk-ink, #1a1a1a)",
                borderRadius: "var(--bk-radius-pill, 9999px)",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
            >
              {chromeString("save_prefix", locale)} <bdi>{saved}</bdi>
            </span>
          )}
          </div>
      {/* Always rendered, even when empty: two cards with a star row and
          four without is four objects, not one shelf. */}
      <div
        data-meta-row
        // 22px, not 20: the star row measures 21px, so a 20px floor let the
        // two cards that have reviews grow 1px taller than the other four —
        // the exact raggedness this row exists to remove. Measured at 1512.
        className="mt-auto flex min-h-[22px] items-center justify-start pt-1.5"
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
        </div>
      </article>
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
      "grid grid-cols-2 gap-bk-sm sm:gap-bk-md md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

    // Category shortcuts. A shelf of six is a sample of the shop; without
    // these the only way onward is one "see all" link under the fold.
    // Counts come from the same membership map the catalogue filters on, so
    // a shortcut cannot advertise a number the catalogue then contradicts,
    // and a category with nothing live in it is not offered at all.
    const categoryLinks = props.show_category_links
      ? ctx.categories
          .map((c) => ({
            // The catalogue reads a slug from ?cat=, falling back to the id.
            handle: c.slug ?? c.id,
            name: c.name,
            count: ctx.category_product_ids?.[c.id]?.length ?? 0,
          }))
          .filter((c) => c.count > 0)
          .slice(0, props.category_links_limit ?? 6)
      : [];
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
        {categoryLinks.length > 0 && (
          // Ink outlines, matching the catalogue's own rail — the buy-yellow
          // stays with buying. Bleeds to the screen edge on a phone so the
          // rail scrolls past the gutter.
          <div
            data-category-links
            className="mb-bk-md -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0"
          >
            {categoryLinks.map((c) => (
              <StoreLink
                key={c.handle}
                href={`/products?cat=${encodeURIComponent(c.handle)}`}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border px-4 py-2 font-body text-sm font-semibold",
                  PRESSABLE,
                )}
                style={{
                  backgroundColor: "transparent",
                  color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
                  borderColor: "var(--bk-divider, rgb(26 26 26 / 0.15))",
                  borderRadius: "var(--bk-radius-pill, 9999px)",
                  fontFamily: "var(--bk-font-body, inherit)",
                }}
              >
                <span>{c.name}</span>
                <span className="text-xs font-medium tabular-nums opacity-60">
                  <bdi>{c.count}</bdi>
                </span>
              </StoreLink>
            ))}
          </div>
        )}
        {props.catalog_controls ? (
          // Full-catalogue mode: chips, sort, price split and load-more over
          // everything already loaded. Cards are still rendered here, so the
          // catalogue can never fork the card design.
          <div data-layer="cards" data-layer-label="Product cards">
            <CatalogGrid
              // The same `cards` the other branches render, so the catalogue
              // cannot fork the card design — and they stay server components.
              items={pillItems.map((product, i) => ({
                product,
                card: cards[i],
              }))}
              categories={ctx.categories}
              categoryProductIds={ctx.category_product_ids}
              locale={locale}
              pageSize={props.catalog_page_size ?? 12}
              showSearch={props.catalog_search === true}
              showFacets={props.enable_filters === true}
            />
          </div>
        ) : props.enable_filters ? (
          // Attribute facets without the full catalogue controls: the same
          // client grid the standard layout uses, drawing price_pill cards.
          <div data-layer="cards" data-layer-label="Product cards">
            <FilterableProductGrid
              products={pillItems}
              locale={locale}
              whatsappPhone={resolveTenantWhatsapp(ctx.tenant)}
              cardStyle="price_pill"
              showStars={props.show_stars === true}
              showDiscountBadge={props.show_discount_badge === true}
              lowStockThreshold={props.low_stock_threshold}
            />
          </div>
        ) : category && pageSize && pillItems.length > pageSize ? (
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
      {category || props.enable_filters ? (
        <>
          {/* Hero is category-only: the catalog page turns filters on
              without one, and this block reads category.name. */}
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
          ) : (
            heading && (
              <SectionHeader
                title={heading}
                color={props.scribble_color ?? "butter"}
              />
            )
          )}
          <FilterableProductGrid
            products={category ? ctx.products : items}
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
