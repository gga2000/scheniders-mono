// =====================================================================
// Orders proof — «191 طلب هذا الأسبوع» under the price
// =====================================================================
// The store's real count of placed orders in the last 7 days, from the
// pre-aggregated tenant_public_stats row (never the orders table, which
// anon cannot read). Nothing is drawn without a fresh count or below the
// merchant's minimum: a small or stale number is left out, never padded.
// The dot pulses softly only under `prefers-reduced-motion: no-preference`.
// =====================================================================

import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { formatCount } from "../helpers/format";
import { readsRtl, xs } from "./text";

/** Below this, the pill is left out unless the merchant sets their own. */
export const DEFAULT_ORDERS_PROOF_MIN = 20;

const CSS = `
@keyframes bk-proof-ping { 0% { transform: scale(1); opacity: .55; } 80%, 100% { transform: scale(2.4); opacity: 0; } }
@media (prefers-reduced-motion: no-preference) {
  .bk-proof-ping { animation: bk-proof-ping calc(var(--bk-duration-reveal) * 4) ease-out infinite; }
}
`;

export function OrdersProof({
  count,
  min,
  locale,
  colorLock,
}: {
  count: number | undefined;
  min: number | undefined;
  locale: LocaleCode;
  /** color_lock (D4): green is for WhatsApp and success only — ink dot. */
  colorLock: boolean;
}) {
  if (count === undefined || count < (min ?? DEFAULT_ORDERS_PROOF_MIN)) return null;
  const rtl = readsRtl(locale);
  const dot = colorLock ? "bg-bk-ink" : "bg-bk-success";
  return (
    <p
      data-orders-proof=""
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-bk-pill bg-bk-surface-alt px-3.5 font-bk-body text-sm font-bold text-bk-ink",
        rtl && "flex-row-reverse",
      )}
    >
      <style href="bk-pdp-orders-proof" precedence="bk-sections">
        {CSS}
      </style>
      <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
        <span className={cn("bk-proof-ping absolute inset-0 rounded-full", dot)} />
        <span className={cn("relative size-2.5 rounded-full", dot)} />
      </span>
      <bdi>
        {formatCount(count, locale, {
          one: xs("ordersWeekOne", locale),
          two: xs("ordersWeekTwo", locale),
          few: xs("ordersWeekFew", locale),
          many: xs("ordersWeekMany", locale),
          other: xs("ordersWeekMany", locale),
        })}
      </bdi>
    </p>
  );
}
