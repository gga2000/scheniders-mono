"use client";

// Express price plate: one framed object that makes the deal unmissable.
// Two labelled rows — the struck price, then the price the shopper pays at
// coin size — and the true discount as a seal. The row labels are merchant
// config (a claim about the struck price is the merchant's to make); the
// concrete "you save X" stamp only renders when show_savings is on.

import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { formatPercent, formatPrice, formatPriceParts } from "../helpers/format";
import { readsRtl, xs } from "./text";

/** Paid-price colour: the cards' "this is what you pay" green, deepened
 *  toward ink for contrast on the light plate. */
const PAID_INK = "color-mix(in srgb, var(--bk-success) 38%, var(--bk-ink))";
/** Struck-price colour: costly red, deepened toward ink for contrast. */
const STRUCK_INK = "color-mix(in srgb, var(--bk-danger) 65%, var(--bk-ink))";

export function DiscountSeal({ pct, locale }: { pct: number; locale: LocaleCode }) {
  return (
    <span className="relative flex h-[68px] w-[68px] shrink-0 flex-col items-center justify-center rounded-bk-pill bg-bk-secondary text-bk-primary shadow-bk-card motion-safe:animate-[bk-seal-in_var(--bk-duration-reveal)_cubic-bezier(.2,.9,.3,1.3)_both]">
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
  compareLabel,
  priceLabel,
  locale,
  flash,
  plateRef,
}: {
  price: number;
  compareAt: number | null;
  discountPct: number | null;
  qty: number;
  showSavings: boolean;
  compareLabel: string;
  priceLabel: string;
  locale: LocaleCode;
  flash: boolean;
  plateRef: React.RefObject<HTMLDivElement | null>;
}) {
  const onSale = compareAt !== null && compareAt > price && discountPct !== null;
  const paid = formatPriceParts(price, locale);
  const rtl = readsRtl(locale);
  const saving = onSale && compareAt !== null ? (compareAt - price) * qty : 0;
  // Label sits on the reading-start side of its price.
  const row = cn("flex items-baseline justify-end gap-2.5", !rtl && "flex-row-reverse");
  const labelCls = "font-bk-body text-xs font-bold text-bk-ink-soft whitespace-nowrap";

  return (
    <div
      ref={plateRef}
      data-price-row
      className="scroll-mt-24 rounded-bk-card border-bk border-bk-divider bg-bk-surface-alt p-1"
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-3 transition-[background-color] duration-bk-base motion-reduce:transition-none",
          rtl && "flex-row-reverse",
        )}
        style={{
          borderRadius: "calc(var(--bk-radius-card) - 4px)",
          backgroundColor: flash
            ? "color-mix(in srgb, var(--bk-accent) 45%, var(--bk-surface))"
            : "var(--bk-surface)",
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {onSale && compareAt !== null && (
            <div className={row} aria-hidden="true">
              <span
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
              {compareLabel && (
                <span className={labelCls} data-i18n-field="compare_label_i18n">
                  {compareLabel}
                </span>
              )}
            </div>
          )}
          <div className={row} aria-hidden={onSale ? true : undefined}>
            <bdi
              className="flex items-baseline gap-1 font-bk-display font-black leading-none tabular-nums"
              style={{ color: onSale ? PAID_INK : "var(--bk-ink)" }}
            >
              <span className="text-[36px]">{paid.amount}</span>
              <span className="text-[14px] font-bold">{paid.currency}</span>
            </bdi>
            {priceLabel && (
              <span className={labelCls} data-i18n-field="price_label_i18n">
                {priceLabel}
              </span>
            )}
          </div>
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
              className={cn(
                "mt-1 inline-flex items-center self-end rounded-bk-pill px-2 py-0.5 font-bk-body text-xs font-bold",
                !rtl && "self-start",
              )}
              style={{
                color: PAID_INK,
                backgroundColor: "color-mix(in srgb, var(--bk-success) 14%, var(--bk-surface))",
              }}
            >
              {xs("youSave", locale, { amount: formatPrice(saving, locale) })}
              {qty > 1 ? ` ${xs("onQty", locale, { count: qty })}` : ""}
            </span>
          )}
        </div>
        {onSale && discountPct !== null && <DiscountSeal pct={discountPct} locale={locale} />}
      </div>
    </div>
  );
}
