import { z } from "zod";
import { addDays } from "./baghdad-day";
import { formatDateKey } from "./format";
import { trialCostIqd } from "./whatsapp-report";

/**
 * The weekly dashboard (Fermi B12 item 5, for Mohammed): one row per Baghdad
 * work week, Saturday to Friday, counted by admin_weekly_dashboard
 * (20261118235058_admin_weekly_dashboard.sql). Paying means what it means on
 * the Paying shops page: both read paid_plan_months. The demo store and
 * prospect stores are never counted; an internal shop is no new shop or
 * trial, but a month it paid before it moved to Internal still counts.
 */

/** Weeks a page may ask for; the database takes 1 to 52. */
export const weeksParamSchema = z.coerce.number().int().min(1).max(52).default(8);

export const weekRowSchema = z.object({
  /** The Saturday the week starts on, '2026-11-14'. */
  week_start: z.string(),
  /** The week still running: its counts run up to now and can still change. */
  running: z.boolean(),
  new_shops: z.number().int(),
  /** New shops that signed up themselves; a shop made from a lead starts on a staff month. */
  trials_started: z.number().int(),
  /** New shops whose first 72 hours are over, and how many had a real order in them. */
  first_order_due: z.number().int(),
  first_order_72h: z.number().int(),
  /** Shops whose first paid month began this week; assisted: from a lead, or called before paying. */
  became_paying: z.number().int(),
  became_paying_assisted: z.number().int(),
  /** Paying at the week's last moment (now, for the running week). */
  paying_at_end: z.number().int(),
  /** Paying when the week started, not when it ended. */
  churned: z.number().int(),
  /** Trial messages Fermi paid for. */
  trial_whatsapp_utility: z.number().int(),
  trial_whatsapp_marketing: z.number().int(),
});

export const weeklyDashboardSchema = z.array(weekRowSchema);

export type WeekRow = z.infer<typeof weekRowSchema>;

export interface WeekSummary extends WeekRow {
  /** The Friday the week ends on. */
  week_end: string;
  /** Whole percent of new shops with a real order inside their first 72 hours; null while none is due. */
  first_order_72h_rate: number | null;
  became_paying_self_serve: number;
  /** What the week's trial messages cost Fermi at Interakt's price, IQD. */
  trial_whatsapp_cost_iqd: number;
}

export function weekSummary(row: WeekRow): WeekSummary {
  return {
    ...row,
    week_end: addDays(row.week_start, 6),
    first_order_72h_rate: row.first_order_due > 0 ? Math.round((100 * row.first_order_72h) / row.first_order_due) : null,
    became_paying_self_serve: row.became_paying - row.became_paying_assisted,
    trial_whatsapp_cost_iqd: trialCostIqd({ trial_utility: row.trial_whatsapp_utility, trial_marketing: row.trial_whatsapp_marketing }),
  };
}

/** The week's days, "15 to 21 Nov", or "29 Nov to 5 Dec" across two months. */
export function weekSpan(week: Pick<WeekSummary, "week_start" | "week_end">): string {
  const sameMonth = week.week_start.slice(0, 7) === week.week_end.slice(0, 7);
  const start = sameMonth ? String(Number(week.week_start.slice(8))) : formatDateKey(week.week_start, false);
  return `${start} to ${formatDateKey(week.week_end, false)}`;
}
