"use client";

// =====================================================================
// Points block — the last part of the express receipt
// =====================================================================
// Earn: «هذا الطلب يعطيك 347 نقطة» and, under it, the rule those points
// count toward. The points are credited by the database when the order is
// delivered (never when it is placed), so the line says so.
//
// Redeem: a quiet «عندك نقاط من طلب سابق؟» link. A phone alone never shows a
// balance (helpers/loyalty-balance), so the link opens one field for an
// earlier order number; once the store confirms the pair, the balance shows
// with «استخدمها», and the receipt's «خصم نقاطك» line carries the discount.
// Nothing here is drawn while the store's points programme is off.
//
// It sits after the total, the receipt's last child, so every block above
// keeps its React useId path.
// =====================================================================

import { useState } from "react";
import { cn, formatPoints, type LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";
import { formatPrice } from "../helpers/format";
import type { ExpressModel } from "./model";
import { xs } from "./text";

export function PointsEarn({
  earn,
  redeem,
  locale,
  rtl,
}: {
  earn: ExpressModel["pointsEarn"];
  redeem: ExpressModel["pointsRedeem"];
  locale: LocaleCode;
  rtl: boolean;
}) {
  const [open, setOpen] = useState(false);
  const balance = redeem?.balance ?? 0;
  const align = rtl ? "text-right" : "text-left";

  return (
    <div data-points-earn={earn?.points ?? 0} className="space-y-2.5 py-3">
      {earn && (
        <div className={cn("flex items-start gap-2.5", rtl && "flex-row-reverse", align)}>
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bk-surface text-bk-ink ring-1 ring-bk-divider"
          >
            <MaterialIcon name="loyalty" className="text-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bk-body text-[13px] font-bold text-bk-ink">
              {xs("pointsEarn", locale, { points: formatPoints(earn.points, locale) })}
            </span>
            <span className="mt-0.5 block font-bk-body text-xs leading-relaxed text-bk-ink-soft">
              {xs("pointsRule", locale, {
                points: formatPoints(earn.per, locale),
                amount: formatPrice(earn.value, locale),
              })}
            </span>
          </span>
        </div>
      )}

      {redeem && !open && (
        <button
          type="button"
          data-points-ask=""
          onClick={() => setOpen(true)}
          className={cn(
            "block min-h-11 w-full font-bk-body text-xs font-bold text-bk-ink underline decoration-bk-ink/30 underline-offset-4",
            align,
          )}
        >
          {xs("pointsHaveAsk", locale)}
        </button>
      )}

      {redeem && open && (
        <div data-points-redeem="" className="space-y-2">
          <label className={cn("block space-y-1", align)}>
            <span className="block font-bk-body text-xs font-bold text-bk-ink-soft">
              {xs("pointsOrderField", locale)}
            </span>
            <input
              name="loyalty_order_number"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              dir="ltr"
              value={redeem.orderNumber}
              onChange={(e) => redeem.setOrderNumber(e.target.value)}
              className="min-h-11 w-full rounded-bk-input border-bk border-bk-divider bg-bk-surface px-3 font-bk-body text-base tabular-nums text-bk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
            />
          </label>
          {balance >= redeem.min && (
            <div
              data-points-balance={balance}
              className={cn("flex items-center justify-between gap-3", rtl && "flex-row-reverse")}
            >
              <span className="font-bk-body text-[13px] font-bold text-bk-ink">
                {xs("pointsBalance", locale, { points: formatPoints(balance, locale) })}
              </span>
              <button
                type="button"
                aria-pressed={redeem.using}
                onClick={() => redeem.setUsing(!redeem.using)}
                className={cn(
                  "min-h-11 rounded-bk-pill px-4 font-bk-body text-xs font-bold transition-colors",
                  redeem.using
                    ? "bg-bk-surface text-bk-ink ring-1 ring-bk-divider"
                    : "bg-bk-ink text-bk-surface",
                )}
              >
                {xs(redeem.using ? "pointsUndo" : "pointsUse", locale)}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
