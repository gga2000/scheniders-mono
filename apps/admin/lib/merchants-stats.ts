import { createAdminClient } from "@/lib/admin-supabase";
import { readDayRange, trialClock } from "@/lib/baghdad-day";
import { fetchFees30d } from "@/lib/console-stats";
import { everyRow } from "@/lib/every-row";
import { ATTENTION, ATTENTION_WALLET_IQD, computedShopFilters } from "@/lib/merchant-filters";
import { merchantSearchFilter } from "@/lib/merchant-search";
import { readShopCity, shopGovernorate } from "@/lib/shop-city";
import { CUSTOMER_SHOP } from "@/lib/customer-shops";
import { ON_TRIAL_FILTER, effectiveStatus } from "@/lib/effective-status";

/** What the numbers need of a shop. `staff_needs_attention` is worked out by the database. */
interface LiteShop {
  id: string;
  status: string;
  plan: string | null;
  trial_ends_at: string | null;
  /** Holds status_before while the shop is paused (lib/effective-status). */
  restrictions: unknown;
  city: string | null;
  wallet: { balance_iqd?: number } | { balance_iqd?: number }[] | null;
  staff_needs_attention: boolean;
}

/** One count for each status a shop can have, so the Pipeline columns add up to the total. */
interface StatusCounts {
  trial: number;
  active: number;
  limited: number;
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
  /**
   * Shops on trial, paused or not: what the Trial pill lists (ON_TRIAL_FILTER)
   * and Trials shows. A paused trial is under "limited" in `status`, so the
   * Pipeline columns still add up to the total.
   */
  on_trial: number;
  buckets: BucketCounts;
  /** Shops per governorate (by map code), for the map. Only governorates with shops. */
  governorates: Record<string, number>;
  /** Shops whose typed city names no governorate the console knows. */
  unknown_city: number;
}

/**
 * The numbers for the shops the Merchants list shows, read with the service
 * role: the API route (/api/merchants/stats) answers with them, and the
 * Merchants page reads them on the server. Callers check the staff sign-in
 * first. A query value that cannot be read is answered with `badRequest`.
 */
export async function readMerchantsStats(searchParams: URLSearchParams) {

  const plan = searchParams.get("plan");
  const status = searchParams.get("status");
  // The city picker names a governorate, read the way the list reads it.
  const city = readShopCity(searchParams.get("city"));
  if ("error" in city) return { badRequest: city.error };
  const search = searchParams.get("search");
  const balance = searchParams.get("balance");
  const health = searchParams.get("health");
  // Sign-up days, on the Baghdad calendar.
  const days = readDayRange(searchParams);
  if ("error" in days) return { badRequest: days.error };

  const supabase = createAdminClient();

  // Plan prices, a month's list price each, come from plan_limits only; a
  // failed read fails the request rather than showing made-up prices. Read
  // alongside the shops, not after them: one round trip less.
  const readPlanPrices = async () => {
    const { data, error } = await supabase.from("plan_limits").select("plan, base_price_iqd");
    if (error) throw error;
    return data;
  };

  // The full filtered tenant set (lightweight columns only), a page at a
  // time: one request stops at 1,000 rows and does not say so.
  const shopsRead = everyRow<LiteShop>((from, to) => {
    let query = supabase
      .from("tenants")
      .select("id, status, plan, trial_ends_at, restrictions, city, wallet(balance_iqd), staff_needs_attention")
      // The demo store and prospect stores (lib/customer-shops) are no customers: in no count.
      .match(CUSTOMER_SHOP);

    if (plan) query = query.eq("plan", plan);
    // "attention" is not a value of the status column: it is one of the computed filters below.
    // "trial" counts a paused trial too, as the list and Trials list it.
    if (status === "trial") query = query.or(ON_TRIAL_FILTER);
    else if (status && status !== ATTENTION) query = query.eq("status", status);
    if (city.governorate) query = query.filter("city", "imatch", city.governorate.pattern);
    // Needs attention and the balance and health bands, filtered by the
    // database the way the list filters them, so these numbers count the
    // list's shops. The header pills ask with no status, so their
    // attention count is always the whole list's.
    for (const [column, operator, value] of computedShopFilters({ status, balance, health })) {
      query = query.filter(column, operator, value);
    }
    if (search) query = query.or(merchantSearchFilter(search));
    if (days.gte) query = query.gte("created_at", days.gte);
    if (days.lt) query = query.lt("created_at", days.lt);

    return query.order("id", { ascending: true }).range(from, to);
  });
  const [tenants, planLimits] = await Promise.all([shopsRead, readPlanPrices()]);

  const empty: Aggregates = {
    total: 0,
    total_wallet_iqd: 0,
    plan_prices_iqd: 0,
    fees_30d_iqd: 0,
    status: { trial: 0, active: 0, limited: 0, suspended: 0, cancelled: 0 },
    on_trial: 0,
    buckets: {
      trials_today: 0,
      trials_expired: 0,
      suspended: 0,
      cancelled: 0,
      low_wallet: 0,
      attention: 0,
    },
    governorates: {},
    unknown_city: 0,
  };

  if (tenants.length === 0) {
    return empty;
  }

  const tenantIds = tenants.map((t) => t.id);

  // Plan prices of the active shops (read above).
  const planPrice: Record<string, number> = {};
  for (const row of planLimits) {
    planPrice[row.plan] = row.base_price_iqd;
  }

  // Our fees (monthly fee, delivered orders, messages) from the filtered set
  // over the last 30 Baghdad days, added up in the database.
  const fees30d = tenantIds.length > 0 ? await fetchFees30d(supabase, tenantIds) : 0;

  // Walk the filtered tenants to compute everything in one pass.
  const status_: StatusCounts = { trial: 0, active: 0, limited: 0, suspended: 0, cancelled: 0 };
  const buckets: BucketCounts = {
    trials_today: 0,
    trials_expired: 0,
    suspended: 0,
    cancelled: 0,
    low_wallet: 0,
    attention: 0,
  };
  const governorates: Record<string, number> = {};
  let unknownCity = 0;
  let onTrial = 0;
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
    const trial = effectiveStatus(s, t.restrictions) === "trial";
    if (trial) onTrial++;

    // The reasons the banner names. Whether a shop needs attention at all is
    // the database's answer (staff_needs_attention), the same one the list
    // filters on: it also counts a locked shop, which has no bucket here.
    if (s === "suspended") buckets.suspended++;
    if (s === "cancelled") buckets.cancelled++;
    // A paused trial is still a trial: its days run and it locks at their end.
    if (trial && trialEnd) {
      // Baghdad calendar days: a trial ending at 06:00 tomorrow ends tomorrow.
      const clock = trialClock(trialEnd, now);
      if (clock.ended) buckets.trials_expired++;
      else if (clock.days === 0) buckets.trials_today++;
    }
    if (balanceVal < ATTENTION_WALLET_IQD && s !== "cancelled") buckets.low_wallet++;

    if (t.staff_needs_attention) buckets.attention++;

    // However the merchant typed the city: "بغداد" and "Baghdad" are one governorate.
    const governorate = shopGovernorate(t.city);
    if (governorate) governorates[governorate.code] = (governorates[governorate.code] ?? 0) + 1;
    else unknownCity++;
  }

  const result: Aggregates = {
    total: tenants.length,
    total_wallet_iqd: totalWallet,
    plan_prices_iqd: planPrices,
    fees_30d_iqd: fees30d,
    status: status_,
    on_trial: onTrial,
    buckets,
    governorates,
    unknown_city: unknownCity,
  };

  return result;
}

function isCountedStatus(status: string): status is keyof StatusCounts {
  return (
    status === "trial" ||
    status === "active" ||
    status === "limited" ||
    status === "suspended" ||
    status === "cancelled"
  );
}
