// =====================================================================
// PricePillCard — the editorial product plate shared by the product grid,
// the filterable category grid, search results and the product finder.
// Lives here (not in product_grid, a section definition that pulls zod and
// the registry) so the client components that render it do not drag the
// whole section library into the shopper's bundle.
// =====================================================================

import Image from "next/image";
import type { LocaleCode } from "@scheniders/shared";
import { Stars } from "./primitives";
import { StoreLink } from "./store-context";
import { chromeString } from "./chrome-strings";
import { formatPrice, discountPercent, formatPercent, formatSavings } from "./format";
import { cn, PRESSABLE } from "./utils";
import type { Product } from "../types";
import { cardName } from "./product-name";

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
            {cardName(product)}
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

