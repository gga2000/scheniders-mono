import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

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

const PLAN_BASE_PRICE_FALLBACK: Record<string, number> = {
  starter: 10000,
  growth: 30000,
  professional: 70000,
  enterprise: 100000,
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    const supabase = createAdminClient();

    // Fetch the full filtered tenant set (lightweight columns only).
    let query = supabase
      .from("tenants")
      .select("id, status, plan, trial_ends_at, wallet(balance_iqd)");

    // Server-side filterable status only — "attention" is synthetic.
    if (plan) query = query.eq("plan", plan);
    if (status && status !== "attention") query = query.eq("status", status);
    if (city) query = query.eq("city", city);
    if (search) {
      query = query.or(
        `business_name.ilike.%${search}%,slug.ilike.%${search}%,contact_email.ilike.%${search}%`
      );
    }
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    const { data: tenants, error } = await query;
    if (error) throw error;

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

    if (!tenants || tenants.length === 0) {
      return NextResponse.json(empty);
    }

    // Apply the "balance" pseudo-filter (computed, not a real column).
    const balancedTenants = balance
      ? tenants.filter((t) => {
          const bal =
            (t as { wallet?: { balance_iqd?: number } | { balance_iqd?: number }[] }).wallet;
          const balVal = Array.isArray(bal)
            ? bal[0]?.balance_iqd ?? 0
            : bal?.balance_iqd ?? 0;
          switch (balance) {
            case "critical":
              return balVal < 10000;
            case "low":
              return balVal >= 10000 && balVal <= 50000;
            case "healthy":
              return balVal > 50000;
            default:
              return true;
          }
        })
      : tenants;

    const tenantIds = balancedTenants.map((t) => t.id);

    // Subscription MRR — real recurring revenue from active subscriptions.
    // Joins plan_limits.base_price_iqd by plan tier; falls back to the
    // hardcoded defaults from the migration if plan_limits is unavailable.
    const { data: planLimits } = await supabase
      .from("plan_limits")
      .select("plan, base_price_iqd");

    const planPrice: Record<string, number> = { ...PLAN_BASE_PRICE_FALLBACK };
    if (planLimits) {
      for (const row of planLimits) {
        planPrice[row.plan as string] = row.base_price_iqd;
      }
    }

    // 30-day rolling usage charges across the filtered set.
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    let usageCharges30d = 0;
    if (tenantIds.length > 0) {
      const { data: charges } = await supabase
        .from("wallet_transactions")
        .select("amount_iqd")
        .in("tenant_id", tenantIds)
        .eq("type", "charge")
        .gte("created_at", thirtyDaysAgo);
      if (charges) {
        for (const row of charges) {
          usageCharges30d += Math.abs(row.amount_iqd);
        }
      }
    }

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

    for (const t of balancedTenants) {
      const s = (t as { status?: keyof StatusCounts }).status;
      const planVal = (t as { plan?: string }).plan ?? "starter";
      const trialEnd = (t as { trial_ends_at?: string | null }).trial_ends_at;
      const walletRel = (t as {
        wallet?: { balance_iqd?: number } | { balance_iqd?: number }[];
      }).wallet;
      const balanceVal = Array.isArray(walletRel)
        ? walletRel[0]?.balance_iqd ?? 0
        : walletRel?.balance_iqd ?? 0;

      // Cancelled/suspended merchants' wallets aren't part of the live float;
      // including them inflates "Total Wallet". Exclude them from the rollup.
      if (s !== "cancelled" && s !== "suspended") {
        totalWallet += balanceVal;
      }

      // MRR = sum of base subscription prices for tenants who are paying.
      if (s === "active") {
        subscriptionMRR += planPrice[planVal] ?? 0;
      }

      if (s && s in status_) status_[s]++;

      // Attention buckets — must mirror needs-attention.ts.
      let isAttention = false;
      if (s === "suspended") {
        buckets.suspended++;
        isAttention = true;
      }
      if (s === "cancelled") {
        buckets.cancelled++;
        isAttention = true;
      }
      if (s === "trial" && trialEnd) {
        const daysLeft = Math.ceil(
          (new Date(trialEnd).getTime() - now) / (1000 * 60 * 60 * 24)
        );
        if (daysLeft <= 0) {
          buckets.trials_expired++;
          isAttention = true;
        } else if (daysLeft <= 1) {
          buckets.trials_today++;
          isAttention = true;
        } else if (daysLeft <= 3) {
          isAttention = true;
        }
      }
      // Critical balance = below 5K with no order activity. We approximate
      // "no orders" with balance proxy; the per-card flag uses usage but
      // for the rollup the balance threshold is the salient signal.
      if (balanceVal < 5000 && s !== "cancelled") {
        buckets.critical_balance++;
        isAttention = true;
      }

      if (isAttention) buckets.attention++;
    }

    const result: Aggregates = {
      total: balancedTenants.length,
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
