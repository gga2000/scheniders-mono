"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Industry } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";
import { refusal } from "@/lib/refusal";

export function useIndustries() {
  return useQuery<Industry[]>({
    queryKey: ["industries"],
    queryFn: async () => {
      const res = await adminFetch("/api/industries");
      okOrLoadFailure(res, "industries");
      const data = await res.json();
      return data.industries;
    },
    staleTime: 120_000,
  });
}

export function useCreateIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; name_ar?: string; icon?: string; color?: string; avg_order_value_iqd?: number }) => {
      const res = await adminFetch("/api/industries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await refusal(res, "Could not add the industry."));
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}

export function useUpdateIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Industry> }) => {
      const res = await adminFetch(`/api/industries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await refusal(res, "Could not save the industry."));
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}

export function useDeleteIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await adminFetch(`/api/industries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await refusal(res, "Could not delete the industry."));
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}
