"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminStore } from "@/store/use-admin-store";

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

  const effectiveStatusFilter = ignoreStatusFilter ? null : statusFilter;

  return useQuery<MerchantsStats>({
    queryKey: [
      "admin",
      "merchants",
      "stats",
      {
        planFilter,
        statusFilter: effectiveStatusFilter,
        cityFilter,
        balanceFilter,
        healthFilter,
        searchQuery,
        dateRange,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (planFilter) params.set("plan", planFilter);
      if (effectiveStatusFilter) params.set("status", effectiveStatusFilter);
      if (cityFilter) params.set("city", cityFilter);
      if (balanceFilter) params.set("balance", balanceFilter);
      if (healthFilter) params.set("health", healthFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (dateRange.from) params.set("date_from", dateRange.from);
      if (dateRange.to) params.set("date_to", dateRange.to);

      const res = await fetch(`/api/merchants/stats?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch merchant stats");
      return res.json();
    },
    staleTime: 30_000,
  });
}
