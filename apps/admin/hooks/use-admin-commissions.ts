"use client";

import { useQuery } from "@tanstack/react-query";
import type { CommissionConfig } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";

export function useCommissionConfigs() {
  return useQuery<CommissionConfig[]>({
    queryKey: ["commission-configs"],
    queryFn: async () => {
      const res = await adminFetch("/api/team/commissions");
      okOrLoadFailure(res, "commission configs");
      const data = await res.json();
      return data.configs;
    },
    staleTime: 60_000,
  });
}
