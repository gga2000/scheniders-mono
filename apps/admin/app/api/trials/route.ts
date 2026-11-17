import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { TRIAL_ENDING_DAYS, trialClock } from "@/lib/baghdad-day";
import { everyRow } from "@/lib/every-row";
import { CUSTOMER_SHOP } from "@/lib/customer-shops";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    // Every shop on trial with its wallet, a page at a time: one read stops at
    // 1,000 rows, and a list of 1,000 ids in the wallet read is too long a URL.
    const trialTenants = await everyRow((from, to) =>
      supabase
        .from("tenants")
        .select("id, business_name, slug, plan, status, trial_ends_at, city, contact_email, created_at, wallet(balance_iqd)")
        .eq("status", "trial")
        // The demo store and prospect stores (lib/customer-shops) are no customers.
        .match(CUSTOMER_SHOP)
        .order("trial_ends_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );

    const now = new Date();

    // Days on the Baghdad calendar: a trial that ends at 06:21 tomorrow has
    // 1 day left and ends tomorrow, whatever the hour now. Once its end has
    // passed it is expired: days_remaining is 0 on the end day, below 0 after.
    const trials = trialTenants.map((t) => {
      const clock = trialClock(t.trial_ends_at, now);
      const { wallet, ...shop } = t;
      const w = Array.isArray(wallet) ? wallet[0] : wallet;
      return {
        ...shop,
        balance_iqd: w?.balance_iqd ?? 0,
        days_remaining: clock.days,
        is_expired: clock.ended,
      };
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
