"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminTenant } from "@/types/admin";
import { useAdminStore } from "@/store/use-admin-store";

interface MerchantsResponse {
  merchants: AdminTenant[];
  total: number;
  page: number;
  limit: number;
}

export function useMerchants(page = 1, limit = 20) {
  const { planFilter, statusFilter, cityFilter, searchQuery } = useAdminStore();

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (planFilter) params.set("plan", planFilter);
  if (statusFilter) params.set("status", statusFilter);
  if (cityFilter) params.set("city", cityFilter);
  if (searchQuery) params.set("search", searchQuery);

  return useQuery<MerchantsResponse>({
    queryKey: ["admin", "merchants", { page, limit, planFilter, statusFilter, cityFilter, searchQuery }],
    queryFn: async () => {
      const res = await fetch(`/api/merchants?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch merchants");
      return res.json();
    },
    staleTime: 30_000,
  });
}
