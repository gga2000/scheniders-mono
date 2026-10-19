// Express identity label: brand eyebrow, the perfume name as the h1, then
// size and the real rating. Every fact is merchant-entered product data;
// absent data simply isn't shown.

import type { LocaleCode } from "@scheniders/shared";
import { Stars } from "../helpers/primitives";
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
  const align = rtl ? "items-end text-right" : "items-start text-left";
  const rating = showRating && reviewCount > 0;

  return (
    <div className={`flex flex-col gap-1 ${align}`}>
      {brand && (
        <p
          className="font-bk-body text-xs font-bold uppercase tracking-[0.18em] text-bk-ink-soft"
          translate="no"
        >
          {brand}
        </p>
      )}
      <h1 className="font-bk-display text-[28px] font-black leading-[1.1] text-bk-ink text-balance">
        {displayNameOf(product)}
      </h1>
      {(size || rating) && (
        <div
          className={`mt-0.5 flex flex-wrap items-center gap-2 ${rtl ? "flex-row-reverse" : ""}`}
        >
          {size ? (
            <span className="rounded-bk-pill border-bk border-bk-divider px-2.5 py-0.5 font-bk-body text-xs font-bold tabular-nums text-bk-ink-soft">
              <bdi>{xs("sizeMl", locale, { n: size })}</bdi>
            </span>
          ) : null}
          {rating && (
            <span
              className={`flex items-center gap-1.5 font-bk-body text-xs font-bold text-bk-ink ${rtl ? "flex-row-reverse" : ""}`}
            >
              <Stars
                value={avgRating}
                size={13}
                label={`${avgRating.toFixed(1)} / 5`}
              />
              <span className="tabular-nums">
                <bdi>{avgRating.toFixed(1)}</bdi>
              </span>
              <span className="text-bk-ink-soft underline decoration-bk-divider underline-offset-2">
                {xs("reviews", locale, { count: reviewCount })}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
