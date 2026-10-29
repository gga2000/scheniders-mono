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
/** The seal gives up a little size on the narrowest phones so the price
 *  column keeps its room; full size from ~400px. */
const SEAL_SIZE = "clamp(56px, 17vw, 68px)";
/** The seal's class list, with the percentage in yellow (today) or, under
 *  `color_lock`, in the espresso partner colour. Two whole strings, so the
 *  unlocked markup stays byte-identical. */
const SEAL_CLS =
  "relative flex shrink-0 flex-col items-center justify-center rounded-bk-pill bg-bk-secondary text-bk-primary shadow-bk-card motion-safe:animate-[bk-seal-in_var(--bk-duration-reveal)_cubic-bezier(.2,.9,.3,1.3)_both]";
const SEAL_CLS_LOCKED =
  "relative flex shrink-0 flex-col items-center justify-center rounded-bk-pill bg-bk-secondary text-bk-on-secondary shadow-bk-card motion-safe:animate-[bk-seal-in_var(--bk-duration-reveal)_cubic-bezier(.2,.9,.3,1.3)_both]";
/** A row label never narrows below this: enough for two short words a
 *  line («السعر بعد / الخصم»), so a long price can't squeeze it to one word
 *  per line or past its longest word. */
const LABEL_FLOOR = "3.75rem";
/** What the paid row spends beside the amount digits: the currency word
 *  and the two gaps. */
const AMOUNT_CHROME = "2.25rem";
/** Advance of one tabular digit in em, a touch above the display font's
 *  real one so the estimate errs toward fitting. */
const DIGIT_EM = 0.55;
/** Paid-price size tracks the price COLUMN (container units), not the
 *  viewport: the seal and the plate padding already took their share. The
 *  amount takes what is left after the label floor, divided across its own
 *  characters — so a longer price shrinks instead of crushing the label,
 *  and the row always fits beside the seal. The vw clamp is the fallback
 *  for engines without container units (an invalid inline value is
 *  dropped and the class applies). */
export function paidSize(amount: string, withLabel: boolean): string {
  const ems = (amount.length * DIGIT_EM).toFixed(2);
  const room = withLabel
    ? `100cqi - ${LABEL_FLOOR} - ${AMOUNT_CHROME}`
    : `100cqi - ${AMOUNT_CHROME}`;
  return `clamp(20px, calc((${room}) / ${ems}), 36px)`;
}
const PAID_SIZE_FALLBACK = "text-[length:clamp(26px,8.5vw,36px)]";

export function DiscountSeal({
  pct,
  locale,
  colorLock = false,
}: {
  pct: number;
  locale: LocaleCode;
  /** `color_lock`: the percentage in the espresso partner colour, not yellow. */
  colorLock?: boolean;
}) {
  return (
    <span
      className={colorLock ? SEAL_CLS_LOCKED : SEAL_CLS}
      style={{ width: SEAL_SIZE, height: SEAL_SIZE }}
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
  compareLabel,
  priceLabel,
  locale,
  flash,
  plateRef,
  colorLock = false,
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
  /** `color_lock` (D4): the paid price in ink, the seal off yellow. */
  colorLock?: boolean;
}) {
  const paidInk = colorLock ? "var(--bk-ink)" : PAID_INK;
  const onSale = compareAt !== null && compareAt > price && discountPct !== null;
  const paid = formatPriceParts(price, locale);
  const rtl = readsRtl(locale);
  const saving = onSale && compareAt !== null ? (compareAt - price) * qty : 0;
  // Label sits on the reading-start side of its price. The price never
  // wraps; the label does, down to its floor (two short lines), and the
  // paid amount's size yields so the row always fits beside the seal.
  const row = cn("flex min-w-0 items-center justify-end gap-2", !rtl && "flex-row-reverse");
  const labelCls = cn(
    "font-bk-body text-xs font-bold leading-tight text-bk-ink-soft text-balance",
    rtl ? "text-right" : "text-left",
  );
  const labelStyle = { minWidth: LABEL_FLOOR };

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
        <div
          className="flex min-w-0 flex-1 flex-col gap-1"
          style={{ containerType: "inline-size" }}
        >
          {onSale && compareAt !== null && (
            <div className={row} aria-hidden="true">
              <span
                className="shrink-0 whitespace-nowrap font-bk-display text-[17px] font-bold leading-tight tabular-nums line-through"
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
                <span className={labelCls} style={labelStyle} data-i18n-field="compare_label_i18n">
                  {compareLabel}
                </span>
              )}
            </div>
          )}
          <div className={row} aria-hidden={onSale ? true : undefined}>
            <bdi
              className="flex shrink-0 items-baseline gap-1 whitespace-nowrap font-bk-display font-black leading-none tabular-nums"
              style={{ color: onSale ? paidInk : "var(--bk-ink)" }}
            >
              <span className={PAID_SIZE_FALLBACK} style={{ fontSize: paidSize(paid.amount, Boolean(priceLabel)) }}>
                {paid.amount}
              </span>
              <span className="text-[14px] font-bold">{paid.currency}</span>
            </bdi>
            {priceLabel && (
              <span className={labelCls} style={labelStyle} data-i18n-field="price_label_i18n">
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
                color: paidInk,
                backgroundColor: "color-mix(in srgb, var(--bk-success) 14%, var(--bk-surface))",
              }}
            >
              {xs("youSave", locale, { amount: formatPrice(saving, locale) })}
              {qty > 1 ? ` ${xs("onQty", locale, { count: qty })}` : ""}
            </span>
          )}
        </div>
        {onSale && discountPct !== null && (
          <DiscountSeal pct={discountPct} locale={locale} colorLock={colorLock} />
        )}
      </div>
    </div>
  );
}
