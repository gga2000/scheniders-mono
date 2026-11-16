import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { fetchFees30d } from "@/lib/console-stats";
import { everyRow } from "@/lib/every-row";
import { ATTENTION, computedShopFilters } from "@/lib/merchant-filters";
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
  critical_balance: number;
  attention: number;
}

interface Aggregates {
  total: number;
  total_wallet_iqd: number;
  subscription_mrr_iqd: number;
  usage_charges_30d_iqd: number;
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
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    const supabase = createAdminClient();

    // The full filtered tenant set (lightweight columns only), a page at a
    // time: one request stops at 1,000 rows and does not say so.
    const tenants = await everyRow<LiteShop>((from, to) => {
      let query = supabase
        .from("tenants")
        .select("id, status, plan, trial_ends_at, wallet(balance_iqd), staff_needs_attention");

      if (plan) query = query.eq("plan", plan);
      // "attention" is never a filter here: the header always counts it, so its pill can light up.
      if (status && status !== ATTENTION) query = query.eq("status", status);
      if (city) query = query.eq("city", city);
      // The balance and health bands, filtered by the database the way the list filters them.
      for (const [column, operator, value] of computedShopFilters({ balance, health })) {
        query = query.filter(column, operator, value);
      }
      if (search) query = query.or(merchantSearchFilter(search));
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo);

      return query.order("id", { ascending: true }).range(from, to);
    });

    const empty: Aggregates = {
      total: 0,
      total_wallet_iqd: 0,
      subscription_mrr_iqd: 0,
      usage_charges_30d_iqd: 0,
      status: { trial: 0, active: 0, suspended: 0, cancelled: 0 },
      buckets: {
        trials_today: 0,
        trials_expired: 0,
        suspended: 0,
        cancelled: 0,
        critical_balance: 0,
        attention: 0,
      },
    };

    if (tenants.length === 0) {
      return NextResponse.json(empty);
    }

    const tenantIds = tenants.map((t) => t.id);

    // Subscription MRR — real recurring revenue from active subscriptions.
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
    const usageCharges30d = tenantIds.length > 0 ? await fetchFees30d(supabase, tenantIds) : 0;

    // Walk the filtered tenants to compute everything in one pass.
    const status_: StatusCounts = { trial: 0, active: 0, suspended: 0, cancelled: 0 };
    const buckets: BucketCounts = {
      trials_today: 0,
      trials_expired: 0,
      suspended: 0,
      cancelled: 0,
      critical_balance: 0,
      attention: 0,
    };
    let totalWallet = 0;
    let subscriptionMRR = 0;

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

      // MRR = sum of base subscription prices for tenants who are paying.
      if (s === "active") {
        subscriptionMRR += planPrice[planVal] ?? 0;
      }

      if (isCountedStatus(s)) status_[s]++;

      // The reasons the banner names. Whether a shop needs attention at all is
      // the database's answer (staff_needs_attention), the same one the list
      // filters on: it also counts a locked shop, which has no bucket here.
      if (s === "suspended") buckets.suspended++;
      if (s === "cancelled") buckets.cancelled++;
      if (s === "trial" && trialEnd) {
        const daysLeft = Math.ceil(
          (new Date(trialEnd).getTime() - now) / (1000 * 60 * 60 * 24)
        );
        if (daysLeft <= 0) buckets.trials_expired++;
        else if (daysLeft <= 1) buckets.trials_today++;
      }
      if (balanceVal < 5000 && s !== "cancelled") buckets.critical_balance++;

      if (t.staff_needs_attention) buckets.attention++;
    }

    const result: Aggregates = {
      total: tenants.length,
      total_wallet_iqd: totalWallet,
      subscription_mrr_iqd: subscriptionMRR,
      usage_charges_30d_iqd: usageCharges30d,
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
