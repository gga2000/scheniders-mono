import { z } from "zod";
import { monthOf } from "./baghdad-day";

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
 * The first month the bonus is paid for: the Fermi plan that set it came on
 * 16 Nov 2026. Earlier months had no bonus, so they are not listed: a row
 * of 250,000 for May read as pay owed.
 */
export const BONUS_FROM_MONTH = "2026-11";

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
  /** Until when the shop counts as paying: the month's end, or a day later while the month waits for its renewal run. */
  paid_until: z.string(),
  /** The paid month's own end (paid_plan_months, 20261119073725): what the page shows. */
  month_end: z.string(),
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

export interface BonusMonth {
  month: string;
  /** Shops paying at the month's last moment, or now for the month still running. */
  payers: number;
  perPersonIqd: number;
  /** Team members paid for the month: today's team who had joined by its end. */
  people: number;
  totalIqd: number;
  /** False for the month still running: its count can still change. */
  final: boolean;
}

/** A team member, by the moment their staff login was made. */
export interface TeamMember {
  joinedAt: string;
}

/**
 * The bonus for the month still running as it stands now, then every past
 * month from BONUS_FROM_MONTH, newest first. Read-only: Ali pays it by hand.
 * A month pays the people on today's team who had joined by its end, so a
 * month that ended does not grow when someone joins later. The console keeps
 * no record of who left, so someone who has left is in no month.
 */
export function bonusMonths(report: PayingMerchants, team: readonly TeamMember[]): BonusMonth[] {
  const month = (m: string, payers: number, final: boolean): BonusMonth => {
    const perPersonIqd = bonusPerPersonIqd(payers);
    const people = team.filter((p) => monthOf(p.joinedAt) <= m).length;
    return { month: m, payers, perPersonIqd, people, totalIqd: perPersonIqd * people, final };
  };
  return [
    month(monthOf(report.at), report.shops.length, false),
    ...[...report.month_ends].reverse().map((m) => month(m.month, m.payers, true)),
  ].filter((m) => m.month >= BONUS_FROM_MONTH);
}

export interface GoalStanding {
  month: string;
  goal: number;
  /** Payers at that month's end; now, while the month has not ended; null for a past month the report does not reach. */
  payers: number | null;
  /** False until the month has ended: the count can still change. */
  final: boolean;
}

/** Where the paying count stands against each stop-rule goal. */
export function goalStandings(report: PayingMerchants): GoalStanding[] {
  const now = monthOf(report.at);
  return PAYER_GOALS.map(({ month, payers: goal }) => {
    const ended = report.month_ends.find((m) => m.month === month);
    if (ended) return { month, goal, payers: ended.payers, final: true };
    return { month, goal, payers: month >= now ? report.shops.length : null, final: false };
  });
}

export interface MonthBar {
  month: string;
  payers: number;
  /** The month still running: its count is the shops paying now. */
  running: boolean;
}

/** Payers at each past month's end, oldest first, then the month still running as it stands now. */
export function monthBars(report: PayingMerchants): MonthBar[] {
  return [
    ...report.month_ends.map((m) => ({ month: m.month, payers: m.payers, running: false })),
    { month: monthOf(report.at), payers: report.shops.length, running: true },
  ];
}
