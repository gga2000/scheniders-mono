// Express identity label: the perfume name as the h1, then quiet tags —
// the maker («الشركة: …», the strongest tag), who it is for, bottle size —
// and the real rating. Every fact is merchant-entered product data; absent
// data simply isn't shown.

import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon, Stars } from "../helpers/primitives";
import type { Product } from "../types";
import { readsRtl, xs } from "./text";

/** The h1: the merchant's public display name when set, else the full
 *  product name with the stored brand removed — only an exact match, as a
 *  leading word or a medial "من {brand}". Never guesses a brand. */
export function displayNameOf(product: Product): string {
  const explicit = product.display_name?.trim();
  if (explicit) return explicit;
  const name = product.name.trim();
  const brand = product.brand?.trim();
  if (!brand) return name;
  const stripped = name
    .replace(` من ${brand}`, "")
    .replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`), "")
    .trim();
  return stripped || name;
}

const GENDER_ICON = { men: "man", women: "woman", unisex: "wc" } as const;

function Tag({
  children,
  strong,
  className,
  "data-tag": dataTag,
}: {
  children: React.ReactNode;
  strong?: boolean;
  className?: string;
  "data-tag"?: string;
}) {
  return (
    <span
      data-tag={dataTag}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-bk-pill px-2.5 font-bk-body text-xs font-bold",
        strong
          ? "bg-bk-secondary text-bk-on-secondary"
          : "border-bk border-bk-divider text-bk-ink-soft",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function IdentityLabel({
  product,
  locale,
  reviewCount,
  avgRating,
  showRating,
}: {
  product: Product;
  locale: LocaleCode;
  reviewCount: number;
  avgRating: number;
  showRating: boolean;
}) {
  const rtl = readsRtl(locale);
  const brand = product.brand?.trim();
  const size = product.size_ml;
  const gender = product.gender;
  const rating = showRating && reviewCount > 0;
  const align = rtl ? "items-end text-right" : "items-start text-left";

  return (
    <div className={cn("flex flex-col gap-2", align)}>
      <h1 className="font-bk-display text-[30px] font-black leading-[1.1] text-bk-ink text-balance">
        {displayNameOf(product)}
      </h1>
      {(brand || gender || size || rating) && (
        // w-full pins the row to the column (a column flex item otherwise
        // sizes to its nowrap content); min-w-0 on the brand pill then lets
        // a long brand ellipsize inside the gutter instead of off-screen.
        <div className={cn("flex w-full flex-wrap items-center gap-1.5", rtl && "flex-row-reverse")}>
          {brand && (
            <Tag strong className="min-w-0 max-w-full" data-tag="brand">
              {/* <bdi> isolates the phrase and takes its direction from the
                  label, so «الشركة:» leads on the right even when the brand
                  itself is Latin. */}
              <bdi className="min-w-0 truncate">
                <span className="font-medium">{xs("brandLabel", locale)}</span>{" "}
                <span translate="no" className="tracking-wide">
                  {brand}
                </span>
              </bdi>
            </Tag>
          )}
          {gender && (
            <Tag className={cn(rtl && "flex-row-reverse")}>
              <MaterialIcon name={GENDER_ICON[gender]} className="text-sm" />
              {xs(gender, locale)}
            </Tag>
          )}
          {size ? (
            <Tag className="tabular-nums">
              <bdi>{xs("sizeMl", locale, { n: size })}</bdi>
            </Tag>
          ) : null}
          {rating && (
            <Tag className={cn("text-bk-ink", rtl && "flex-row-reverse")}>
              <Stars value={avgRating} size={12} label={`${avgRating.toFixed(1)} / 5`} />
              <bdi className="tabular-nums">{avgRating.toFixed(1)}</bdi>
              <span className="font-normal text-bk-ink-soft">
                ({xs("reviews", locale, { count: reviewCount })})
              </span>
            </Tag>
          )}
        </div>
      )}
    </div>
  );
}
