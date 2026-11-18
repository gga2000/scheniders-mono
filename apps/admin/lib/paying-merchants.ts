import { z } from "zod";
import { dayOf } from "./baghdad-day";

/**
 * Paying merchants and the staff bonus (Fermi B12 items 3 and 4). A paying
 * merchant has a paid, non-trial month covering the moment counted (handoff
 * Q10), read from the ledger by admin_paying_merchants
 * (20261118233023_admin_paying_merchants.sql): the shops paying now, and the
 * count at the end of each past Baghdad month. The rule lives in
 * paid_plan_months (20261118235058_admin_weekly_dashboard.sql), which the
 * weekly dashboard reads too, so the two paying counts cannot differ.
 */

/** Each team member's pay for a month: this, plus BONUS_PER_PAYER_IQD for every shop paying at the month's end. */
export const BONUS_BASE_IQD = 250_000;
export const BONUS_PER_PAYER_IQD = 1_000;

/**
 * The stop rules the paying count feeds (handoff B12 item 3): fewer payers
 * than this at the end of the month is the signal to stop and rethink.
 */
export const PAYER_GOALS = [
  { month: "2026-12", payers: 15 },
  { month: "2027-01", payers: 60 },
] as const;

/** Months of month-end counts a page may ask for; the database takes 1 to 36. */
export const monthsParamSchema = z.coerce.number().int().min(1).max(36).default(6);

export const payingShopSchema = z.object({
  tenant_id: z.string(),
  display_id: z.number().int(),
  name: z.string().nullable(),
  plan: z.string(),
  paid_until: z.string(),
  first_paid_at: z.string(),
  /** outreach: a lead staff converted; signup: the shop signed up itself. Ads, agency and referral come with signup attribution (C2, C6). */
  source: z.enum(["outreach", "signup"]),
});

export const monthEndSchema = z.object({ month: z.string(), payers: z.number().int() });

export const payingMerchantsSchema = z.object({
  at: z.string(),
  shops: z.array(payingShopSchema),
  month_ends: z.array(monthEndSchema),
});

export type PayingMerchants = z.infer<typeof payingMerchantsSchema>;
export type MonthEnd = z.infer<typeof monthEndSchema>;

export function bonusPerPersonIqd(payers: number): number {
  return BONUS_BASE_IQD + BONUS_PER_PAYER_IQD * payers;
}

/** The Baghdad month a moment falls in, as "2026-11". */
export function monthOf(instant: string | Date | number): string {
  return dayOf(instant).slice(0, 7);
}

export interface BonusMonth {
  month: string;
  /** Shops paying at the month's last moment, or now for the month still running. */
  payers: number;
  perPersonIqd: number;
  totalIqd: number;
  /** False for the month still running: its count can still change. */
  final: boolean;
}

/**
 * The bonus for every past month, newest first, then the month still running
 * as it stands now. Read-only: Ali pays it by hand.
 */
export function bonusMonths(report: PayingMerchants, people: number): BonusMonth[] {
  const month = (m: string, payers: number, final: boolean): BonusMonth => {
    const perPersonIqd = bonusPerPersonIqd(payers);
    return { month: m, payers, perPersonIqd, totalIqd: perPersonIqd * people, final };
  };
  return [
    month(monthOf(report.at), report.shops.length, false),
    ...[...report.month_ends].reverse().map((m) => month(m.month, m.payers, true)),
  ];
}
