import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { readDayRange, trialClock } from "@/lib/baghdad-day";
import { fetchFees30d } from "@/lib/console-stats";
import { everyRow } from "@/lib/every-row";
import { ATTENTION, ATTENTION_WALLET_IQD, computedShopFilters } from "@/lib/merchant-filters";
import { merchantSearchFilter } from "@/lib/merchant-search";

/** What the numbers need of a shop. `staff_needs_attention` is worked out by the database. */
interface LiteShop {
  id: string;
  status: string;
  plan: string | null;
  trial_ends_at: string | null;
  wallet: { balance_iqd?: number } | { balance_iqd?: number }[] | null;
  staff_needs_attention: boolean;
}

interface StatusCounts {
  trial: number;
  active: number;
  suspended: number;
  cancelled: number;
}

interface BucketCounts {
  trials_today: number;
  trials_expired: number;
  suspended: number;
  cancelled: number;
  low_wallet: number;
  attention: number;
}

interface Aggregates {
  total: number;
  total_wallet_iqd: number;
  plan_prices_iqd: number;
  fees_30d_iqd: number;
  status: StatusCounts;
  buckets: BucketCounts;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = request.nextUrl;

    const plan = searchParams.get("plan");
    const status = searchParams.get("status");
    const city = searchParams.get("city");
    const search = searchParams.get("search");
    const balance = searchParams.get("balance");
    const health = searchParams.get("health");
    // Sign-up days, on the Baghdad calendar.
    const days = readDayRange(searchParams);
    if ("error" in days) return NextResponse.json({ error: days.error }, { status: 400 });

    const supabase = createAdminClient();

    // The full filtered tenant set (lightweight columns only), a page at a
    // time: one request stops at 1,000 rows and does not say so.
    const tenants = await everyRow<LiteShop>((from, to) => {
      let query = supabase
        .from("tenants")
        .select("id, status, plan, trial_ends_at, wallet(balance_iqd), staff_needs_attention")
        // The demo store (Fermi B13) is no customer: it is in no count.
        .eq("is_demo", false);

      if (plan) query = query.eq("plan", plan);
      // "attention" is never a filter here: the header always counts it, so its pill can light up.
      if (status && status !== ATTENTION) query = query.eq("status", status);
      if (city) query = query.eq("city", city);
      // The balance and health bands, filtered by the database the way the list filters them.
      for (const [column, operator, value] of computedShopFilters({ balance, health })) {
        query = query.filter(column, operator, value);
      }
      if (search) query = query.or(merchantSearchFilter(search));
      if (days.gte) query = query.gte("created_at", days.gte);
      if (days.lt) query = query.lt("created_at", days.lt);

      return query.order("id", { ascending: true }).range(from, to);
    });

    const empty: Aggregates = {
      total: 0,
      total_wallet_iqd: 0,
      plan_prices_iqd: 0,
      fees_30d_iqd: 0,
      status: { trial: 0, active: 0, suspended: 0, cancelled: 0 },
      buckets: {
        trials_today: 0,
        trials_expired: 0,
        suspended: 0,
        cancelled: 0,
        low_wallet: 0,
        attention: 0,
      },
    };

    if (tenants.length === 0) {
      return NextResponse.json(empty);
    }

    const tenantIds = tenants.map((t) => t.id);

    // Plan prices of the active shops, a month's list price each.
    // Prices come from plan_limits only; a failed read fails the request
    // rather than showing made-up prices.
    const { data: planLimits, error: planLimitsError } = await supabase
      .from("plan_limits")
      .select("plan, base_price_iqd");
    if (planLimitsError) throw planLimitsError;

    const planPrice: Record<string, number> = {};
    for (const row of planLimits) {
      planPrice[row.plan] = row.base_price_iqd;
    }

    // Our fees (monthly fee, delivered orders, messages) from the filtered set
    // over the last 30 Baghdad days, added up in the database.
    const fees30d = tenantIds.length > 0 ? await fetchFees30d(supabase, tenantIds) : 0;

    // Walk the filtered tenants to compute everything in one pass.
    const status_: StatusCounts = { trial: 0, active: 0, suspended: 0, cancelled: 0 };
    const buckets: BucketCounts = {
      trials_today: 0,
      trials_expired: 0,
      suspended: 0,
      cancelled: 0,
      low_wallet: 0,
      attention: 0,
    };
    let totalWallet = 0;
    let planPrices = 0;

    const now = Date.now();

    for (const t of tenants) {
      const s = t.status;
      const planVal = t.plan ?? "starter";
      const trialEnd = t.trial_ends_at;
      const balanceVal = Array.isArray(t.wallet) ? t.wallet[0]?.balance_iqd ?? 0 : t.wallet?.balance_iqd ?? 0;

      // Cancelled/suspended merchants' wallets aren't part of the live float;
      // including them inflates "Total Wallet". Exclude them from the rollup.
      if (s !== "cancelled" && s !== "suspended") {
        totalWallet += balanceVal;
      }

      // A month of plan price for each active shop, at the list price.
      if (s === "active") {
        planPrices += planPrice[planVal] ?? 0;
      }

      if (isCountedStatus(s)) status_[s]++;

      // The reasons the banner names. Whether a shop needs attention at all is
      // the database's answer (staff_needs_attention), the same one the list
      // filters on: it also counts a locked shop, which has no bucket here.
      if (s === "suspended") buckets.suspended++;
      if (s === "cancelled") buckets.cancelled++;
      if (s === "trial" && trialEnd) {
        // Baghdad calendar days: a trial ending at 06:00 tomorrow ends tomorrow.
        const clock = trialClock(trialEnd, now);
        if (clock.ended) buckets.trials_expired++;
        else if (clock.days === 0) buckets.trials_today++;
      }
      if (balanceVal < ATTENTION_WALLET_IQD && s !== "cancelled") buckets.low_wallet++;

      if (t.staff_needs_attention) buckets.attention++;
    }

    const result: Aggregates = {
      total: tenants.length,
      total_wallet_iqd: totalWallet,
      plan_prices_iqd: planPrices,
      fees_30d_iqd: fees30d,
      status: status_,
      buckets,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Merchants stats API error:", error);
    return NextResponse.json(
      { error: "Failed to compute merchant stats" },
      { status: 500 }
    );
  }
}

function isCountedStatus(status: string): status is keyof StatusCounts {
  return status === "trial" || status === "active" || status === "suspended" || status === "cancelled";
}
