"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CommissionConfig, EmployeeCommission } from "@/types/leads";
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

export function useUpdateCommissionConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CommissionConfig> }) => {
      const res = await adminFetch("/api/team/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      if (!res.ok) throw new Error("Failed to update commission config");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission-configs"] });
    },
  });
}
