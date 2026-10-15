// =====================================================================
// Free gift threshold (config in commerce.free_gift)
// =====================================================================
// "Spend 75,000 and the gift is yours." The cart strip that announces this
// has existed for a while; nothing ever added the gift, so every qualifying
// order silently broke the promise.
//
// The rule here is the whole point: the strip may only make the promise
// when a gift is actually configured, and the SERVER adds the line. A
// client-added free item would be a zero-price line anyone could post.
// =====================================================================

import type { FreeGiftRewardConfig } from "./types/store-config-v2";

export interface ResolvedFreeGift {
  enabled: boolean;
  productId: string | null;
  thresholdIqd: number;
}

/**
 * Enabled only when the merchant turned it on, named a product, and set a
 * positive threshold. Any of those missing means the storefront must not
 * promise a gift.
 */
export function resolveFreeGift(cfg?: FreeGiftRewardConfig | null): ResolvedFreeGift {
  const threshold =
    typeof cfg?.threshold_iqd === "number" && Number.isFinite(cfg.threshold_iqd)
      ? Math.max(0, Math.round(cfg.threshold_iqd))
      : 0;
  const productId = typeof cfg?.product_id === "string" && cfg.product_id.trim()
    ? cfg.product_id
    : null;
  return {
    enabled: cfg?.enabled === true && productId !== null && threshold > 0,
    productId,
    thresholdIqd: threshold,
  };
}

export interface FreeGiftProgress {
  /** The gift is earned at this subtotal. */
  thresholdIqd: number;
  /** How much more to spend; 0 once unlocked. */
  remainingIqd: number;
  unlocked: boolean;
  /** 0–100, for a progress bar. */
  percent: number;
}

/** Progress toward the gift, or `null` when no gift is configured. */
export function freeGiftProgress(
  cfg: FreeGiftRewardConfig | null | undefined,
  subtotalIqd: number,
): FreeGiftProgress | null {
  const resolved = resolveFreeGift(cfg);
  if (!resolved.enabled) return null;

  const subtotal = Math.max(0, Number(subtotalIqd) || 0);
  const remaining = Math.max(0, resolved.thresholdIqd - subtotal);
  return {
    thresholdIqd: resolved.thresholdIqd,
    remainingIqd: remaining,
    unlocked: remaining === 0,
    percent: Math.min(100, Math.round((subtotal / resolved.thresholdIqd) * 100)),
  };
}

/**
 * Does this order qualify for the gift?
 *
 * `subtotalIqd` must be the SERVER's verified item subtotal, and it must
 * exclude the gift itself — otherwise a free line would count toward the
 * threshold that earns it.
 */
export function qualifiesForFreeGift(
  cfg: FreeGiftRewardConfig | null | undefined,
  subtotalIqd: number,
): boolean {
  const resolved = resolveFreeGift(cfg);
  return resolved.enabled && subtotalIqd >= resolved.thresholdIqd;
}
