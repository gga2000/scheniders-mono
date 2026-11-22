import type { createAdminClient } from "@/lib/admin-supabase";
import { TRIAL_ENDING_DAYS, dayNumber, trialClock } from "@/lib/baghdad-day";
import { everyRow } from "@/lib/every-row";
import { CUSTOMER_SHOP } from "@/lib/customer-shops";
import { ON_TRIAL_FILTER, isPausedTrial } from "@/lib/effective-status";

/**
 * Every shop on trial with its wallet and its days, for the Trials list and
 * the trial follow-up read (app/api/trials, app/api/trials/follow-up).
 *
 * A page at a time: one read stops at 1,000 rows, and a list of 1,000 ids in
 * a wallet read is too long a URL. A paused trial is still a trial: its days
 * run and it locks at their end (lib/effective-status), so it stays, marked
 * paused. Days are on the Baghdad calendar: a trial that ends at 06:21
 * tomorrow has 1 day left, whatever the hour now; once its end has passed it
 * is expired, days_remaining 0 on the end day and below 0 after. The shop's
 * own day is on the same calendar, counted as the support plan counts its
 * first-week calls (lib/support.ts): Day 0 on the day it signed up, Day 1 the
 * day its store-check call falls due, Day 3 its first-order call (audit
 * round 22: Trials said "Day 1" on the plan's Day 0).
 */
export async function readTrialShops(supabase: ReturnType<typeof createAdminClient>, now: Date) {
  const rows = await everyRow((from, to) =>
    supabase
      .from("tenants")
      .select("id, business_name, slug, plan, status, restrictions, trial_ends_at, city, contact_email, created_at, wallet(balance_iqd)")
      .or(ON_TRIAL_FILTER)
      // The demo store and prospect stores (lib/customer-shops) are no customers.
      .match(CUSTOMER_SHOP)
      .order("trial_ends_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map((t) => {
    const clock = trialClock(t.trial_ends_at, now);
    const { wallet, restrictions, ...shop } = t;
    const w = Array.isArray(wallet) ? wallet[0] : wallet;
    return {
      ...shop,
      paused: isPausedTrial(t.status, restrictions),
      balance_iqd: w?.balance_iqd ?? 0,
      days_remaining: clock.days,
      is_expired: clock.ended,
      trial_day: dayNumber(t.created_at, now) - 1,
    };
  });
}

export type TrialShop = Awaited<ReturnType<typeof readTrialShops>>[number];

/** The Trials page's four counts; "ending" is the one number every screen uses (TRIAL_ENDING_DAYS). */
export function trialSummary(trials: readonly TrialShop[]) {
  return {
    total: trials.length,
    expiringSoon: trials.filter((t) => !t.is_expired && t.days_remaining <= TRIAL_ENDING_DAYS).length,
    expired: trials.filter((t) => t.is_expired).length,
    healthy: trials.filter((t) => !t.is_expired && t.days_remaining > TRIAL_ENDING_DAYS).length,
  };
}
