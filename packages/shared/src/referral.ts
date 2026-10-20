// =====================================================================
// Referral engine (config in commerce.referral)
// =====================================================================
// Pure math + normalisation shared by the storefront forms (preview), the
// checkout server (the truth) and the thank-you page (the share link).
// The server never trusts a client amount: it re-resolves the code against
// the referral_codes table and the PUBLISHED config.
// =====================================================================

import type { LoyaltyConfig, ReferralConfig } from "./types/store-config-v2";

/** Query parameter a shared link carries: `/?ref=AB3K7M`. */
export const REFERRAL_PARAM = "ref";

export interface ResolvedReferral {
  enabled: boolean;
  friendDiscountPct: number;
  friendMaxDiscountIqd: number | null;
  referrerPoints: number;
}

/**
 * The program as it actually runs. It is "enabled" only when the merchant
 * switched it on AND the friend gets something: a referral with 0 % off is
 * a code nobody has a reason to use. Referrer points need loyalty on to be
 * spendable; without it they are simply not promised.
 */
export function resolveReferral(
  cfg?: ReferralConfig | null,
  loyalty?: LoyaltyConfig | null,
): ResolvedReferral {
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  const pct = Math.min(100, num(cfg?.friend_discount_pct, 0));
  const max = typeof cfg?.friend_max_discount_iqd === "number" && cfg.friend_max_discount_iqd > 0
    ? Math.round(cfg.friend_max_discount_iqd)
    : null;
  const points = loyalty?.enabled === true ? Math.floor(num(cfg?.referrer_points, 0)) : 0;
  return {
    enabled: cfg?.enabled === true && pct > 0,
    friendDiscountPct: pct,
    friendMaxDiscountIqd: max,
    referrerPoints: points,
  };
}

/** IQD off the friend's subtotal (0 when the program is off). */
export function computeReferralDiscount(
  subtotalIqd: number,
  cfg?: ReferralConfig | null,
  loyalty?: LoyaltyConfig | null,
): number {
  const r = resolveReferral(cfg, loyalty);
  if (!r.enabled || !Number.isFinite(subtotalIqd) || subtotalIqd <= 0) return 0;
  let amount = Math.round((subtotalIqd * r.friendDiscountPct) / 100);
  if (r.friendMaxDiscountIqd !== null) amount = Math.min(amount, r.friendMaxDiscountIqd);
  return Math.max(0, Math.min(amount, Math.round(subtotalIqd)));
}

/**
 * Codes are minted from this alphabet (no 0/O/1/I/L) and compared
 * upper-case with whitespace removed, so "ab3k 7m" is the code AB3K7M.
 */
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 6;

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.replace(/\s+/g, "").toUpperCase();
  if (code.length !== REFERRAL_CODE_LENGTH) return null;
  for (const ch of code) if (!REFERRAL_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** The link a referrer shares: the store's entry with the code attached. */
export function referralShareUrl(origin: string, base: string, code: string): string {
  const url = new URL(`${base || ""}/`, origin);
  url.searchParams.set(REFERRAL_PARAM, code);
  return url.toString();
}
