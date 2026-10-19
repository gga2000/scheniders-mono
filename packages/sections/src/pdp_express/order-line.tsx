"use client";

// Express order line: quantity and payment as two small tags. Tapping a
// tag opens its control right under the row (one at a time). Cash on
// delivery is the only live method; merchant-announced methods are listed
// as "soon" and cannot be chosen — the order still posts payment_method cod.

import { useState } from "react";
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";
import type { Props } from "../pdp_direct_order";
import { readsRtl, xs } from "./text";

const stepBtn =
  "flex h-11 w-11 items-center justify-center rounded-bk-pill text-bk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";

type Panel = "qty" | "payment" | null;

function TagButton({
  open,
  onClick,
  label,
  value,
  controls,
  rtl,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  value: React.ReactNode;
  controls: string;
  rtl: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-bk-pill border-bk px-3 font-bk-body text-[13px] transition-colors duration-bk-fast motion-reduce:transition-none",
        open ? "border-bk-ink bg-bk-surface-alt" : "border-bk-divider bg-bk-surface",
        rtl && "flex-row-reverse",
      )}
    >
      <span className="text-bk-ink-soft">{label}</span>
      <span className="font-bold text-bk-ink">{value}</span>
      <MaterialIcon
        name="expand_more"
        className={cn(
          "text-base text-bk-ink-faint transition-transform duration-bk-fast motion-reduce:transition-none",
          open && "rotate-180",
        )}
      />
    </button>
  );
}

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
  idBase,
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
  idBase: string;
}) {
  const rtl = readsRtl(locale);
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  // Each soon method listed once, whatever the stored array holds.
  const soonMethods = Array.from(new Set(soon));
  const qtyId = `${idBase}-qty-panel`;
  const payId = `${idBase}-pay-panel`;
  const rowCls = cn("flex items-center justify-between", rtl && "flex-row-reverse");

  return (
    <div className="space-y-2" data-layer="qty" data-layer-label="Quantity and payment">
      <div className={cn("flex flex-wrap items-center gap-2", rtl && "flex-row-reverse")}>
        <TagButton
          open={panel === "qty"}
          onClick={() => toggle("qty")}
          label={xs("quantity", locale)}
          value={<bdi className="tabular-nums">{qty}</bdi>}
          controls={qtyId}
          rtl={rtl}
        />
        <TagButton
          open={panel === "payment"}
          onClick={() => toggle("payment")}
          label={xs("payment", locale)}
          value={xs("cashOnDelivery", locale)}
          controls={payId}
          rtl={rtl}
        />
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-bk-base ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: panel ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden" inert={!panel}>
          {panel === "qty" && (
            <div id={qtyId} className={cn(rowCls, "rounded-bk-card bg-bk-surface-alt px-3 py-1")}>
              <span className="font-bk-body text-[13px] font-bold text-bk-ink-soft">
                {xs("quantity", locale)}
              </span>
              <div className="flex items-center rounded-bk-pill bg-bk-surface">
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
          )}
          {panel === "payment" && (
            <ul
              id={payId}
              aria-label={xs("payment", locale)}
              className="divide-y divide-bk-divider rounded-bk-card bg-bk-surface-alt px-3"
            >
              <li className={cn(rowCls, "h-11")}>
                <span className="font-bk-body text-[13px] font-bold text-bk-ink">
                  {xs("cashOnDelivery", locale)}
                </span>
                <MaterialIcon name="check_circle" className="text-lg text-bk-success" />
              </li>
              {soonMethods.map((method) => (
                <li key={method} aria-disabled="true" className={cn(rowCls, "h-11")}>
                  <span className="font-bk-body text-[13px] font-bold text-bk-ink-faint">
                    {xs(method, locale)}
                  </span>
                  <span className="rounded-bk-pill bg-bk-surface px-2 py-0.5 font-bk-body text-[11px] font-bold text-bk-ink-soft">
                    {xs("soon", locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
