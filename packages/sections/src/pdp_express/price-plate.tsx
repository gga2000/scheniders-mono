"use client";

// Express price plate: one framed object that makes the deal unmissable.
// The struck price (per unit, unlabelled — the merchant has not confirmed
// it as a regular price), the paid price at coin size, and the true
// discount as a seal. The concrete "you save X" stamp exists but only
// renders when the merchant turns show_savings on.

import type { LocaleCode } from "@scheniders/shared";
import { formatPercent, formatPrice, formatPriceParts } from "../helpers/format";
import { readsRtl, xs } from "./text";

/** Paid-price colour: the cards' "this is what you pay" green, deepened
 *  toward ink for contrast on the light plate. */
const PAID_INK =
  "color-mix(in srgb, var(--bk-success) 38%, var(--bk-ink))";
/** Struck-price colour: costly red, deepened toward ink for contrast. */
const STRUCK_INK = "color-mix(in srgb, var(--bk-danger) 65%, var(--bk-ink))";

export function DiscountSeal({
  pct,
  locale,
}: {
  pct: number;
  locale: LocaleCode;
}) {
  return (
    <span
      className="relative flex h-[68px] w-[68px] shrink-0 flex-col items-center justify-center rounded-bk-pill bg-bk-secondary text-bk-primary shadow-bk-card motion-safe:animate-[bk-seal-in_var(--bk-duration-reveal)_cubic-bezier(.2,.9,.3,1.3)_both]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-[4px] rounded-bk-pill border-bk border-dashed border-bk-primary/60"
      />
      <span className="font-bk-display text-[21px] font-black leading-none tabular-nums">
        <bdi>{formatPercent(pct, locale)}</bdi>
      </span>
      <span className="mt-0.5 font-bk-body text-[11px] font-bold leading-none text-bk-on-secondary">
        {xs("discount", locale)}
      </span>
    </span>
  );
}

export function PricePlate({
  price,
  compareAt,
  discountPct,
  qty,
  showSavings,
  locale,
  flash,
  plateRef,
}: {
  price: number;
  compareAt: number | null;
  discountPct: number | null;
  qty: number;
  showSavings: boolean;
  locale: LocaleCode;
  flash: boolean;
  plateRef: React.RefObject<HTMLDivElement | null>;
}) {
  const onSale = compareAt !== null && compareAt > price && discountPct !== null;
  const paid = formatPriceParts(price, locale);
  const rtl = readsRtl(locale);
  const saving = onSale && compareAt !== null ? (compareAt - price) * qty : 0;

  return (
    <div
      ref={plateRef}
      data-price-row
      className="scroll-mt-24 rounded-bk-card border-bk border-bk-divider bg-bk-surface-alt p-1"
    >
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 transition-[background-color] duration-bk-base motion-reduce:transition-none ${rtl ? "flex-row-reverse" : ""}`}
        style={{
          borderRadius: "calc(var(--bk-radius-card) - 4px)",
          backgroundColor: flash
            ? "color-mix(in srgb, var(--bk-accent) 45%, var(--bk-surface))"
            : "var(--bk-surface)",
        }}
      >
        <div className={`flex min-w-0 flex-col ${rtl ? "items-end" : "items-start"}`}>
          {onSale && compareAt !== null && (
            <span
              aria-hidden="true"
              className="font-bk-display text-[17px] font-bold leading-tight tabular-nums line-through"
              style={{
                color: STRUCK_INK,
                textDecorationColor: "var(--bk-danger)",
                textDecorationThickness:
                  "min(calc(var(--bk-border-thickness-bold) * 2), 0.12em)",
                textDecorationSkipInk: "none",
              }}
            >
              <bdi>{formatPrice(compareAt, locale)}</bdi>
            </span>
          )}
          <span
            aria-hidden={onSale ? true : undefined}
            className="flex items-baseline gap-1.5 font-bk-display font-black leading-none tabular-nums"
            style={{ color: onSale ? PAID_INK : "var(--bk-ink)" }}
          >
            <bdi className="flex items-baseline gap-1.5">
              <span className="text-[40px]">{paid.amount}</span>
              <span className="text-[15px] font-bold">{paid.currency}</span>
            </bdi>
          </span>
          {onSale && compareAt !== null && (
            <span className="sr-only">
              {xs("priceSr", locale, {
                new: formatPrice(price, locale),
                old: formatPrice(compareAt, locale),
              })}
            </span>
          )}
          {showSavings && saving > 0 && (
            <span
              className="mt-1.5 inline-flex items-center rounded-bk-pill px-2 py-0.5 font-bk-body text-xs font-bold"
              style={{
                color: PAID_INK,
                backgroundColor:
                  "color-mix(in srgb, var(--bk-success) 14%, var(--bk-surface))",
              }}
            >
              {xs("youSave", locale, { amount: formatPrice(saving, locale) })}
              {qty > 1 ? ` ${xs("onQty", locale, { count: qty })}` : ""}
            </span>
          )}
        </div>
        {onSale && discountPct !== null && (
          <DiscountSeal pct={discountPct} locale={locale} />
        )}
      </div>
    </div>
  );
}
