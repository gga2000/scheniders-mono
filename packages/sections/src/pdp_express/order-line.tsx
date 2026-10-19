// Express order line: quantity and payment, each one quiet row. Cash on
// delivery is the (only) live method; merchant-announced methods show as
// non-selectable "soon" chips — the order still posts payment_method cod.

import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";
import type { Props } from "../pdp_direct_order";
import { readsRtl, xs } from "./text";

const stepBtn =
  "flex h-11 w-11 items-center justify-center text-bk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus rounded-bk-pill";

export function OrderLine({
  locale,
  qty,
  setQty,
  maxQty,
  atMinQty,
  atMaxQty,
  decreaseLabel,
  increaseLabel,
  soon,
}: {
  locale: LocaleCode;
  qty: number;
  setQty: (update: (q: number) => number) => void;
  maxQty: number;
  atMinQty: boolean;
  atMaxQty: boolean;
  decreaseLabel: string;
  increaseLabel: string;
  soon: NonNullable<Props["payment_soon"]>;
}) {
  const rtl = readsRtl(locale);
  const row = cn("flex items-center justify-between gap-3", rtl && "flex-row-reverse");
  const label = "font-bk-body text-[13px] font-bold text-bk-ink-soft";
  // Each soon method listed once, whatever the stored array holds.
  const soonMethods = Array.from(new Set(soon));

  return (
    <div className="divide-y divide-bk-divider rounded-bk-card border-bk border-bk-divider bg-bk-surface px-3">
      <div className={cn(row, "py-1")} data-layer="qty" data-layer-label="Quantity stepper">
        <span className={label}>{xs("quantity", locale)}</span>
        {/* Hours-style LTR row: − n + reads the same in every locale. */}
        <div className="flex items-center rounded-bk-pill bg-bk-surface-alt">
          <button
            type="button"
            onClick={() => {
              if (!atMinQty) setQty((q) => Math.max(1, q - 1));
            }}
            aria-label={decreaseLabel}
            aria-disabled={atMinQty || undefined}
            className={cn(stepBtn, atMinQty && "opacity-40")}
          >
            <MaterialIcon name="remove" className="text-lg" />
          </button>
          <output
            aria-live="polite"
            className="w-7 text-center font-bk-display text-base font-black tabular-nums text-bk-ink"
          >
            {qty}
          </output>
          <button
            type="button"
            onClick={() => {
              if (!atMaxQty) setQty((q) => Math.min(maxQty, q + 1));
            }}
            aria-label={increaseLabel}
            aria-disabled={atMaxQty || undefined}
            className={cn(stepBtn, atMaxQty && "opacity-40")}
          >
            <MaterialIcon name="add" className="text-lg" />
          </button>
        </div>
      </div>
      <div className={cn(row, "py-2.5")}>
        <span className={label}>{xs("payment", locale)}</span>
        <div className={cn("flex flex-wrap items-center gap-1.5", rtl ? "justify-start flex-row-reverse" : "justify-end")}>
          <span className="inline-flex h-8 items-center gap-1 rounded-bk-pill bg-bk-secondary px-3 font-bk-body text-xs font-bold text-bk-on-secondary">
            <MaterialIcon name="check" className="text-sm text-bk-primary" />
            {xs("cashOnDelivery", locale)}
          </span>
          {soonMethods.map((method) => (
            <span
              key={method}
              aria-disabled="true"
              className="inline-flex h-8 items-center gap-1 rounded-bk-pill border-bk border-dashed border-bk-divider px-2.5 font-bk-body text-xs font-bold text-bk-ink-faint"
            >
              {xs(method, locale)}
              <span className="rounded-bk-pill bg-bk-surface-alt px-1.5 py-px text-[10px] text-bk-ink-soft">
                {xs("soon", locale)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
