// =====================================================================
// Loyalty / points engine (config in commerce.loyalty)
// =====================================================================
// Pure earn + redeem math. Points are earned on an order's item subtotal and
// redeemed for an IQD discount at checkout. The server is the source of truth:
// it re-resolves earn/redeem against the PUBLISHED config and the customer's
// authoritative balance — a client-supplied points amount is never trusted.
// =====================================================================

import type { LocaleCode, LoyaltyConfig } from "./types/store-config-v2";

export interface ResolvedLoyalty {
  enabled: boolean;
  earnPerIqd: number;
  redeemValueIqd: number;
  minRedeemPoints: number;
  /** 0–100; 100 means redemption may cover the whole subtotal. */
  maxRedeemPct: number;
}

export function resolveLoyalty(cfg?: LoyaltyConfig | null): ResolvedLoyalty {
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  return {
    enabled: cfg?.enabled === true,
    earnPerIqd: num(cfg?.earn_per_iqd, 0),
    redeemValueIqd: num(cfg?.redeem_value_iqd, 0),
    minRedeemPoints: Math.floor(num(cfg?.min_redeem_points, 0)),
    maxRedeemPct: Math.min(100, num(cfg?.max_redeem_pct, 100)),
  };
}

/** Whole points earned on a subtotal (0 when disabled). */
export function computePointsEarned(
  subtotalIqd: number,
  cfg?: LoyaltyConfig | null,
): number {
  const l = resolveLoyalty(cfg);
  if (!l.enabled || l.earnPerIqd <= 0) return 0;
  return Math.floor(Math.max(0, subtotalIqd) * l.earnPerIqd);
}

export interface RedemptionResult {
  points_used: number;
  discount_iqd: number;
}

/**
 * How many points actually apply and the IQD discount they buy — respecting the
 * customer's balance, the minimum, the per-point value, the subtotal, and the
 * max-% cap. Returns zeros when redemption isn't possible.
 */
export function computePointsRedemption(opts: {
  balance: number;
  requestedPoints: number;
  subtotalIqd: number;
  cfg?: LoyaltyConfig | null;
}): RedemptionResult {
  const l = resolveLoyalty(opts.cfg);
  const none = { points_used: 0, discount_iqd: 0 };
  if (!l.enabled || l.redeemValueIqd <= 0) return none;

  const want = Math.min(
    Math.max(0, Math.floor(opts.requestedPoints)),
    Math.max(0, Math.floor(opts.balance)),
  );
  if (want < l.minRedeemPoints || want <= 0) return none;

  const subtotal = Math.max(0, opts.subtotalIqd);
  const cap = Math.min(subtotal, Math.floor((subtotal * l.maxRedeemPct) / 100));
  const rawDiscount = want * l.redeemValueIqd;
  const discount = Math.min(rawDiscount, cap);
  if (discount <= 0) return none;

  // If the cap bit, only spend the points the granted discount actually buys.
  const points_used =
    discount === rawDiscount ? want : Math.floor(discount / l.redeemValueIqd);
  if (points_used <= 0) return none;
  return { points_used, discount_iqd: Math.round(points_used * l.redeemValueIqd) };
}

/**
 * "N points" with the Arabic count shapes the dialect actually uses:
 * one → "نقطة واحدة", two → "نقطتين", 3–10 → "N نقاط", 11+ → "N نقطة".
 */
export function formatPoints(points: number, locale: LocaleCode): string {
  const n = Math.max(0, Math.floor(points));
  if (locale === "ku") return `${n} خاڵ`;
  if (locale !== "ar") return n === 1 ? "1 point" : `${n} points`;
  if (n === 1) return "نقطة واحدة";
  if (n === 2) return "نقطتين";
  if (n >= 3 && n <= 10) return `${n} نقاط`;
  return `${n} نقطة`;
}
