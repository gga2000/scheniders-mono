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
import { formatCount } from "@/lib/format";

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

/** Fewer real orders than this in 30 days reads as "hardly selling". */
const FEW_ORDERS = 5;
/** A trial ending within this many Baghdad days (or already ended) with no order yet is about to be lost. */
const TRIAL_LAST_DAYS = 3;

export interface ChurnFacts {
  status: string;
  trialEndsAt: string | null;
  walletIqd: number;
  /**
   * The shop's real orders of the 30 Baghdad days that end today: the orders
   * the health score's "orders" part counts too (staff_health_parts). Never the
   * plan's usage counter, which misses store checkout orders.
   */
  orders30d: number;
}

/**
 * The flame: a shop staff should call before it is gone. Suspended, or nearly
 * out of money and hardly selling, or a trial about to end with no order. A
 * cancelled shop is already gone, so it never has one.
 */
export function isChurnRisk(shop: ChurnFacts, now: number = Date.now()): boolean {
  if (shop.status === "cancelled") return false;
  if (shop.status === "suspended") return true;
  if (shop.walletIqd < ATTENTION_WALLET_IQD && shop.orders30d < FEW_ORDERS) return true;
  if (shop.status === "trial" && shop.trialEndsAt) {
    return trialClock(shop.trialEndsAt, now).days <= TRIAL_LAST_DAYS && shop.orders30d === 0;
  }
  return false;
}

/** The flame for a row of the Merchants list, which carries the shop's real orders of 30 days. */
export function listChurnRisk(shop: AdminTenant, now?: number): boolean {
  return isChurnRisk(
    {
      status: shop.status,
      trialEndsAt: shop.trial_ends_at,
      walletIqd: shop.wallet?.balance_iqd ?? 0,
      orders30d: shop.orders_30d ?? 0,
    },
    now,
  );
}

/**
 * The Shops at risk banner. A shop with a low wallet is in both lists (a low
 * balance is one of the risk reasons), so it counts shops, not list rows:
 * "2 issues" for one shop sent staff looking for a second.
 */
export function shopsAtRiskLine(atRisk: { tenant_id: string }[], lowWallets: { tenant_id: string }[]): string {
  const shops = new Set([...atRisk, ...lowWallets].map((row) => row.tenant_id)).size;
  const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;
  return `${plural(shops, "shop needs", "shops need")} a look: ${formatCount(atRisk.length)} at risk, ${plural(lowWallets.length, "low wallet", "low wallets")}`;
}
