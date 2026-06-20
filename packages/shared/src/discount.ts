// =====================================================================
// Discount / coupon engine (definitions live in commerce.discounts)
// =====================================================================
// Pure validation + amount calc. The server is the source of truth: it
// re-resolves the code against the PUBLISHED discounts and records the
// resulting `discount_amount` — a client-supplied amount is never trusted.
// Redemption caps / per-customer limits need DB state and come later.
// =====================================================================

import type { DiscountCode } from "./types/store-config-v2";

export interface DiscountResult {
  /** The matched code, in its configured casing. */
  code: string;
  /** Discount to subtract from the subtotal (IQD); always 0 < amount ≤ subtotal. */
  amount_iqd: number;
}

function isActive(d: DiscountCode, now: number): boolean {
  if (d.enabled === false) return false;
  if (d.starts_iso) {
    const s = Date.parse(d.starts_iso);
    if (!Number.isNaN(s) && now < s) return false;
  }
  if (d.ends_iso) {
    const e = Date.parse(d.ends_iso);
    // A malformed end must not leave a code valid forever (EC21 lesson).
    if (Number.isNaN(e) || now > e) return false;
  }
  return true;
}

/**
 * Resolve a coupon code against the store's discounts and return the discount to
 * apply, or null when the code is unknown / inactive / unqualified. Match is
 * case-insensitive; the amount is clamped to `(0, subtotal]`.
 */
export function computeDiscount(
  subtotalIqd: number,
  rawCode: string | null | undefined,
  discounts: DiscountCode[] | null | undefined,
  now: Date = new Date(),
): DiscountResult | null {
  if (!rawCode || !discounts) return null;
  if (!Number.isFinite(subtotalIqd) || subtotalIqd <= 0) return null;
  const code = rawCode.trim().toLowerCase();
  if (!code) return null;

  const d = discounts.find((x) => x.code.trim().toLowerCase() === code);
  if (!d) return null;
  if (!isActive(d, now.getTime())) return null;
  if (typeof d.min_subtotal_iqd === "number" && subtotalIqd < d.min_subtotal_iqd) {
    return null;
  }

  let amount: number;
  if (d.kind === "percent") {
    const pct = Math.max(0, Math.min(100, d.value));
    amount = Math.round((subtotalIqd * pct) / 100);
    if (typeof d.max_discount_iqd === "number" && d.max_discount_iqd >= 0) {
      amount = Math.min(amount, Math.round(d.max_discount_iqd));
    }
  } else {
    amount = Math.round(d.value);
  }

  amount = Math.max(0, Math.min(amount, subtotalIqd));
  if (amount <= 0) return null;
  return { code: d.code, amount_iqd: amount };
}
