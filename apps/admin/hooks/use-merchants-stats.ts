"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminStore } from "@/store/use-admin-store";
import { adminFetch } from "@/lib/admin-fetch";
import { merchantsStatsKey, merchantsStatsParams } from "@/lib/merchants-query";

export interface MerchantsStats {
  total: number;
  total_wallet_iqd: number;
  /** A month of plan price for each active shop, at the list price. */
  plan_prices_iqd: number;
  /** Our fees (monthly fee, delivered orders, paid messages), last 30 Baghdad days. */
  fees_30d_iqd: number;
  status: {
    trial: number;
    active: number;
    limited: number;
    suspended: number;
    cancelled: number;
  };
  /** Shops on trial, paused or not: what the Trial pill lists. */
  on_trial: number;
  buckets: {
    trials_today: number;
    trials_expired: number;
    suspended: number;
    cancelled: number;
    low_wallet: number;
    attention: number;
  };
  /** Shops per governorate, keyed by the map's code. Only governorates with shops. */
  governorates: Record<string, number>;
  /** Shops whose typed city names no governorate. */
  unknown_city: number;
}

interface UseMerchantsStatsOptions {
  /** The header pills and the digest count every status, so a pill can light up. */
  ignoreStatusFilter?: boolean;
}

/**
 * The numbers for the shops the list shows: same filters, "needs attention"
 * included, counted over every shop rather than the pages loaded so far.
 */
export function useMerchantsStats(options: UseMerchantsStatsOptions = {}) {
  const { ignoreStatusFilter = false } = options;
  const {
    planFilter,
    statusFilter,
    cityFilter,
    balanceFilter,
    healthFilter,
    searchQuery,
    dateRange,
  } = useAdminStore();

  const filters = {
    planFilter,
    statusFilter: ignoreStatusFilter ? null : statusFilter,
    cityFilter,
    balanceFilter,
    healthFilter,
    searchQuery,
    dateRange,
  };

  return useQuery<MerchantsStats>({
    queryKey: merchantsStatsKey(filters),
    queryFn: async () => {
      const params = merchantsStatsParams(filters);
      const res = await adminFetch(`/api/merchants/stats?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch merchant stats");
      return res.json();
    },
    staleTime: 30_000,
  });
}
