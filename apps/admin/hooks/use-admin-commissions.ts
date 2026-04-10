"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CommissionConfig, EmployeeCommission } from "@/types/leads";

export function useCommissionConfigs() {
  return useQuery<CommissionConfig[]>({
    queryKey: ["commission-configs"],
    queryFn: async () => {
      const res = await fetch("/api/team/commissions");
      if (!res.ok) throw new Error("Failed to fetch commission configs");
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
      const res = await fetch("/api/team/commissions", {
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

export function useCalculateCommissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { period_start: string; period_end: string }) => {
      const res = await fetch("/api/team/commissions/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to calculate commissions");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-team"] });
      qc.invalidateQueries({ queryKey: ["commission-configs"] });
    },
  });
}
