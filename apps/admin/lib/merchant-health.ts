/*
 * How a shop's health reads in the console: the colour of its score and the
 * flame beside it. Both used to be copied into every screen that drew them
 * (two palettes for one score; a flame the shop's dialog worked out from the
 * orders of six months while the list read one month), so one shop could be
 * green with no flame here and red with a flame there.
 *
 * The score itself comes from the database (staff_health_score). This file
 * only says which band a score is in and when the flame shows.
 */
import type { AdminTenant } from "@/types/admin";
import { trialClock } from "@/lib/baghdad-day";
import { ATTENTION_WALLET_IQD, HEALTH_AT_RISK_BELOW, HEALTH_HEALTHY_FROM } from "@/lib/merchant-filters";

export type HealthBand = "healthy" | "warning" | "at_risk";

/** The band a score is in: the same three bands the Merchants health filter cuts. */
export function healthBand(score: number): HealthBand {
  if (score >= HEALTH_HEALTHY_FROM) return "healthy";
  if (score >= HEALTH_AT_RISK_BELOW) return "warning";
  return "at_risk";
}

const CHIP: Record<HealthBand, string> = {
  healthy: "text-emerald-700 bg-emerald-100 dark:bg-emerald-400/15 dark:text-emerald-300",
  warning: "text-amber-700 bg-amber-100 dark:bg-amber-400/15 dark:text-amber-300",
  at_risk: "text-rose-700 bg-rose-100 dark:bg-rose-400/15 dark:text-rose-300",
};

const DOT: Record<HealthBand, string> = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-500",
  at_risk: "bg-rose-500",
};

/** Text and background of the score chip. */
export function healthChipClass(score: number): string {
  return CHIP[healthBand(score)];
}

/** The small dot inside the chip. */
export function healthDotClass(score: number): string {
  return DOT[healthBand(score)];
}

/** Fewer orders than this in the newest usage month reads as "hardly selling". */
const FEW_ORDERS = 5;
/** A trial ending within this many Baghdad days (or already ended) with no order yet is about to be lost. */
const TRIAL_LAST_DAYS = 3;

export interface ChurnFacts {
  status: string;
  trialEndsAt: string | null;
  walletIqd: number;
  /** Orders of the shop's newest usage month: the month the health score reads too. */
  ordersNewestMonth: number;
}

/**
 * The flame: a shop staff should call before it is gone. Suspended, or nearly
 * out of money and hardly selling, or a trial about to end with no order.
 */
export function isChurnRisk(shop: ChurnFacts, now: number = Date.now()): boolean {
  if (shop.status === "suspended") return true;
  if (shop.walletIqd < ATTENTION_WALLET_IQD && shop.ordersNewestMonth < FEW_ORDERS) return true;
  if (shop.status === "trial" && shop.trialEndsAt) {
    return trialClock(shop.trialEndsAt, now).days <= TRIAL_LAST_DAYS && shop.ordersNewestMonth === 0;
  }
  return false;
}

/** The flame for a row of the Merchants list, whose `usage` is the newest usage month. */
export function listChurnRisk(shop: AdminTenant, now?: number): boolean {
  return isChurnRisk(
    {
      status: shop.status,
      trialEndsAt: shop.trial_ends_at,
      walletIqd: shop.wallet?.balance_iqd ?? 0,
      ordersNewestMonth: shop.usage?.orders_count ?? 0,
    },
    now,
  );
}

/** Orders of the newest month among a shop's usage rows, in any order. 0 when it has none. */
export function newestMonthOrders(
  usage: ReadonlyArray<{ year: number; month: number; orders_count: number | null }>,
): number {
  const newest = usage.reduce<(typeof usage)[number] | null>(
    (best, row) =>
      best === null || row.year > best.year || (row.year === best.year && row.month > best.month) ? row : best,
    null,
  );
  return newest?.orders_count ?? 0;
}
