import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { TRIAL_ENDING_DAYS, dayNumber, trialClock } from "@/lib/baghdad-day";
import { everyRow } from "@/lib/every-row";
import { CUSTOMER_SHOP } from "@/lib/customer-shops";
import { ON_TRIAL_FILTER, isPausedTrial } from "@/lib/effective-status";
import { trialGroups, trialPipelineSchema, type TrialFollowUp } from "@/lib/trial-pipeline";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    // Every shop on trial with its wallet, a page at a time: one read stops at
    // 1,000 rows, and a list of 1,000 ids in the wallet read is too long a URL.
    // A paused trial is still a trial: its days run and it locks at their end
    // (lib/effective-status), so it stays on the list, marked paused.
    // The follow-up facts (orders, WhatsApp, Prime, the one-trial check, the
    // last call) are counted in the database for every trial in one answer
    // (lib/trial-pipeline). A failed read answers 500, never a list of zeros.
    const [trialTenants, pipeline] = await Promise.all([
      everyRow((from, to) =>
        supabase
          .from("tenants")
          .select("id, business_name, slug, plan, status, restrictions, trial_ends_at, city, contact_email, created_at, wallet(balance_iqd)")
          .or(ON_TRIAL_FILTER)
          // The demo store and prospect stores (lib/customer-shops) are no customers.
          .match(CUSTOMER_SHOP)
          .order("trial_ends_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      supabase.rpc("admin_trial_pipeline").then(({ data, error }) => {
        if (error) throw error;
        return trialPipelineSchema.parse(data);
      }),
    ]);
    const followUps = new Map<string, TrialFollowUp>(pipeline.map((facts) => [facts.tenant_id, facts]));

    const now = new Date();

    // Days on the Baghdad calendar: a trial that ends at 06:21 tomorrow has
    // 1 day left and ends tomorrow, whatever the hour now. Once its end has
    // passed it is expired: days_remaining is 0 on the end day, below 0 after.
    // The shop's own day (1 on the day it signed up) is on the same calendar.
    // follow_up is null only for a shop that started its trial between the
    // two reads: the next refresh has it.
    const trials = trialTenants.map((t) => {
      const clock = trialClock(t.trial_ends_at, now);
      const { wallet, restrictions, ...shop } = t;
      const w = Array.isArray(wallet) ? wallet[0] : wallet;
      const row = {
        ...shop,
        paused: isPausedTrial(t.status, restrictions),
        balance_iqd: w?.balance_iqd ?? 0,
        days_remaining: clock.days,
        is_expired: clock.ended,
        trial_day: dayNumber(t.created_at, now),
        follow_up: followUps.get(t.id) ?? null,
      };
      return { ...row, groups: trialGroups(row) };
    });

    const summary = {
      total: trials.length,
      expiringSoon: trials.filter((t) => !t.is_expired && t.days_remaining <= TRIAL_ENDING_DAYS).length,
      expired: trials.filter((t) => t.is_expired).length,
      healthy: trials.filter((t) => !t.is_expired && t.days_remaining > TRIAL_ENDING_DAYS).length,
    };

    return NextResponse.json({ trials, summary });
  } catch (error) {
    console.error("Trials API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trials" },
      { status: 500 }
    );
  }
}
