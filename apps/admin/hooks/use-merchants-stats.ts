"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminStore } from "@/store/use-admin-store";

export interface MerchantsStats {
  total: number;
  total_wallet_iqd: number;
  subscription_mrr_iqd: number;
  usage_charges_30d_iqd: number;
  status: {
    trial: number;
    active: number;
    suspended: number;
    cancelled: number;
  };
  buckets: {
    trials_today: number;
    trials_expired: number;
    suspended: number;
    cancelled: number;
    critical_balance: number;
    attention: number;
  };
}

interface UseMerchantsStatsOptions {
  ignoreStatusFilter?: boolean;
}

export function useMerchantsStats(options: UseMerchantsStatsOptions = {}) {
  const { ignoreStatusFilter = false } = options;
  const {
    planFilter,
    statusFilter,
    cityFilter,
    balanceFilter,
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
        searchQuery,
        dateRange,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (planFilter) params.set("plan", planFilter);
      // "attention" is synthetic — don't forward; stats endpoint always
      // returns the full attention count so the pill can be highlighted.
      if (effectiveStatusFilter && effectiveStatusFilter !== "attention") {
        params.set("status", effectiveStatusFilter);
      }
      if (cityFilter) params.set("city", cityFilter);
      if (balanceFilter) params.set("balance", balanceFilter);
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
