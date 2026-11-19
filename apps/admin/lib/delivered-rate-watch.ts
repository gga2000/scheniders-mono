import { z } from "zod";

/**
 * Delivered-rate watch (Fermi B12 item 6, fee leak). A shop that ships by
 * "export for shipping" or moves its orders by hand pays the delivered-order
 * fee only when it marks an order delivered. admin_delivered_rate_watch
 * (20261118233951_admin_delivered_rate_watch.sql) gives each shop's
 * delivered rate, the platform median and its parcels in transit too long,
 * leaving out return and exchange orders, with the two rules it uses (days
 * in transit before a parcel is stuck, shipped orders a rate needs); the
 * flags below pick the shops for a person to check. Nothing here acts on a
 * shop.
 */

/** A rate under this share of the median is far below it: with a median of 80%, under 56%. */
export const FAR_BELOW_MEDIAN_SHARE = 0.7;
/** This many stuck parcels or more flags a shop. */
export const STUCK_FLAG_MIN = 5;

/** Days of shipped orders a page may ask for; the database takes 7 to 365. */
export const daysParamSchema = z.coerce.number().int().min(7).max(365).default(60);

export const watchShopSchema = z.object({
  tenant_id: z.string(),
  display_id: z.number().int(),
  name: z.string().nullable(),
  plan: z.string(),
  shipped: z.number().int(),
  delivered: z.number().int(),
  /** Percent, one decimal; null under min_shipped_for_rate shipped orders. */
  rate: z.number().nullable(),
  stuck: z.number().int(),
  oldest_stuck_since: z.string().nullable(),
  exports: z.number().int(),
  prime_linked: z.boolean(),
});

export const deliveredRateWatchSchema = z.object({
  at: z.string(),
  window_from: z.string(),
  window_to: z.string(),
  median_rate: z.number().nullable(),
  /** A parcel in transit longer than this is stuck; orders made since are not counted yet. */
  stuck_after_days: z.number().int().positive(),
  /** Shipped orders a shop needs for a rate. */
  min_shipped_for_rate: z.number().int().positive(),
  shops: z.array(watchShopSchema),
});

export type WatchShop = z.infer<typeof watchShopSchema>;
export type WatchFlag = "far_below_median" | "stuck_parcels";

/** The rate a shop must stay at or above, to one decimal as rates are: 56 for a median of 80. */
export function farBelowLine(medianRate: number): number {
  return Math.round(medianRate * FAR_BELOW_MEDIAN_SHARE * 10) / 10;
}

/**
 * Why a shop is worth a look. The internal plan pays no delivered-order fee,
 * so it is never flagged: its numbers are only a yardstick.
 */
export function watchFlags(shop: WatchShop, medianRate: number | null): WatchFlag[] {
  if (shop.plan === "internal") return [];
  const flags: WatchFlag[] = [];
  if (shop.rate !== null && medianRate !== null && shop.rate < farBelowLine(medianRate)) {
    flags.push("far_below_median");
  }
  if (shop.stuck >= STUCK_FLAG_MIN) flags.push("stuck_parcels");
  return flags;
}
