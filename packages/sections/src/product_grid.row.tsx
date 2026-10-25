// =====================================================================
// product_grid — "row" layout
// =====================================================================
// A horizontal, snap-scrolling row of compact product cards for the foot of
// a product page: the photo, the perfume's public name, who makes it
// («الشركة: …») and who it is for — both straight from product data and
// absent when the merchant has not entered them — the real rating, and the
// price. A sold-out product is greyed and labelled, never dressed up as
// orderable; `query.sold_out_last` puts such products after everything a
// shopper can order.
//
// Server component: native CSS scroll-snap, no JavaScript. Arabic-script
// locales reverse the row's VISUAL order with a class (the document stays
// LTR), so the first card sits at the right edge and the row scrolls
// leftwards, the way an Arabic reader expects. From `lg` up it is a plain
// four-column grid, so a mouse never has to drag a scrollbar-less strip.
// The visual language is the express PDP's: hairline cards and quiet tags.
// =====================================================================

import Image from "next/image";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon, Section, Stars } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { chromeString } from "./helpers/chrome-strings";
import { formatPrice } from "./helpers/format";
import { isBuyable } from "./helpers/stock";
import { cn, PRESSABLE } from "./helpers/utils";
import { displayNameOf, GENDER_ICON, Tag } from "./pdp_express/identity-label";
import { readsRtl, xs } from "./pdp_express/text";
import type { Product } from "./types";

/** Compact tag sizing — the express tags are sized for a full-width h1 row. */
const TAG_COMPACT = "h-6 px-2 text-[11px]";

function RowCard({
  product,
  locale,
  showRating,
}: {
  product: Product;
  locale: LocaleCode;
  showRating: boolean;
}) {
  const rtl = readsRtl(locale);
  const buyable = isBuyable(product);
  const brand = product.brand?.trim();
  const gender = product.gender;
  const compareAt = product.compare_at_price;
  const onSale = buyable && compareAt != null && compareAt > product.price;
  const reviewCount = product.review_count ?? 0;
  const avgRating = product.avg_rating ?? 0;
  const rating = showRating && reviewCount > 0;
  // The public name everywhere on the card, the photo's alt included: the
  // long marketing name repeats the maker the brand tag already states.
  const name = displayNameOf(product);

  return (
    <li
      className={cn(
        "w-[44%] shrink-0 sm:w-[30%] lg:w-auto",
        rtl ? "snap-end" : "snap-start",
      )}
    >
      <StoreLink
        href={`/products/${product.slug ?? product.id}`}
        data-product-card={product.id}
        data-sold-out={buyable ? undefined : ""}
        className={cn("group block h-full", PRESSABLE)}
      >
        <article className="flex h-full flex-col overflow-hidden rounded-bk-card border-bk border-bk-divider bg-bk-surface">
          <div className="relative aspect-square overflow-hidden bg-bk-surface-alt">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={name}
                fill
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 22vw"
                className={cn("object-cover", !buyable && "opacity-60 grayscale")}
              />
            ) : null}
            {!buyable && (
              <span
                className={cn(
                  "absolute top-2 inline-flex h-6 items-center rounded-bk-pill bg-bk-ink px-2 font-bk-body text-[11px] font-bold text-bk-surface",
                  rtl ? "right-2" : "left-2",
                )}
              >
                {chromeString("sold_out", locale)}
              </span>
            )}
          </div>
          <div
            className={cn(
              "flex flex-1 flex-col gap-1.5 p-2.5",
              rtl ? "items-end text-right" : "items-start text-left",
            )}
          >
            <h3 className="line-clamp-2 font-bk-display text-[15px] font-bold leading-snug text-bk-ink">
              {name}
            </h3>
            {(brand || gender || rating) && (
              <div className={cn("flex w-full flex-wrap gap-1", rtl && "flex-row-reverse")}>
                {brand && (
                  <Tag strong className={cn(TAG_COMPACT, "min-w-0 max-w-full")} data-tag="brand">
                    {/* <bdi> takes its direction from the label, so «الشركة:»
                        leads on the right even when the brand is Latin. */}
                    <bdi className="min-w-0 truncate">
                      <span className="font-medium">{xs("brandLabel", locale)}</span>{" "}
                      <span translate="no">{brand}</span>
                    </bdi>
                  </Tag>
                )}
                {gender && (
                  <Tag className={cn(TAG_COMPACT, rtl && "flex-row-reverse")} data-tag="gender">
                    <MaterialIcon name={GENDER_ICON[gender]} className="text-sm" />
                    {xs(gender, locale)}
                  </Tag>
                )}
                {rating && (
                  <Tag
                    className={cn(TAG_COMPACT, "text-bk-ink", rtl && "flex-row-reverse")}
                    data-tag="rating"
                  >
                    {/* One glyph and the real average — five rounded stars
                        overstate a 4.6 as a 5. */}
                    <Stars value={1} max={1} size={11} label={`${avgRating.toFixed(1)} / 5`} />
                    <bdi className="tabular-nums">{avgRating.toFixed(1)}</bdi>
                    <span className="font-normal text-bk-ink-soft tabular-nums">
                      <bdi>({reviewCount})</bdi>
                    </span>
                  </Tag>
                )}
              </div>
            )}
            <div
              className={cn(
                "mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1",
                rtl && "flex-row-reverse",
              )}
            >
              <span
                className={cn(
                  "font-bk-display text-base font-black tabular-nums",
                  buyable ? "text-bk-ink" : "text-bk-ink-faint",
                )}
              >
                <bdi>{formatPrice(product.price, locale)}</bdi>
              </span>
              {onSale && compareAt != null && (
                <span
                  data-compare-at
                  className="font-bk-body text-xs text-bk-ink-faint line-through tabular-nums"
                >
                  <bdi>{formatPrice(compareAt, locale)}</bdi>
                </span>
              )}
            </div>
          </div>
        </article>
      </StoreLink>
    </li>
  );
}

export function ProductRow({
  products,
  locale,
  heading,
  subheading,
  seeAllHref,
  seeAllLabel,
  showRating,
}: {
  products: Product[];
  locale: LocaleCode;
  heading: string;
  subheading: string;
  seeAllHref?: string;
  seeAllLabel: string;
  showRating: boolean;
}) {
  if (products.length === 0) return null;
  const rtl = readsRtl(locale);

  return (
    <Section data-layout="row">
      {(heading || seeAllHref) && (
        <div
          className={cn(
            "mb-bk-sm flex items-end justify-between gap-bk-sm",
            rtl && "flex-row-reverse",
          )}
        >
          <div className={cn("min-w-0", rtl ? "text-right" : "text-left")}>
            {heading && (
              <h2
                data-i18n-field="heading_i18n"
                className="font-bk-display text-[22px] font-black leading-tight text-bk-ink text-balance"
              >
                {heading}
              </h2>
            )}
            {subheading && (
              <p
                data-i18n-field="subheading_i18n"
                className="mt-1 font-bk-body text-sm text-bk-ink-soft"
              >
                {subheading}
              </p>
            )}
          </div>
          {seeAllHref && (
            <StoreLink
              href={seeAllHref}
              data-i18n-field="see_all_label_i18n"
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1 font-bk-body text-sm font-bold text-bk-ink underline underline-offset-4",
                rtl && "flex-row-reverse",
                PRESSABLE,
              )}
            >
              {seeAllLabel || chromeString("see_all", locale)}
              <MaterialIcon name={rtl ? "arrow_back" : "arrow_forward"} className="text-base" />
            </StoreLink>
          )}
        </div>
      )}
      <ul
        data-layer="cards"
        data-layer-label="Product cards"
        className={cn(
          // Bleeds past the section gutter on a phone so the next card
          // visibly peeks at the screen edge, the cue that it scrolls.
          "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-bk-sm overflow-x-auto px-4 pb-1",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0",
          rtl && "flex-row-reverse",
        )}
      >
        {products.map((product) => (
          <RowCard
            key={product.id}
            product={product}
            locale={locale}
            showRating={showRating}
          />
        ))}
      </ul>
    </Section>
  );
}
