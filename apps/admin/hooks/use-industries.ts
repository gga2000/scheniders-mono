"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Industry } from "@/types/leads";

export function useIndustries() {
  return useQuery<Industry[]>({
    queryKey: ["industries"],
    queryFn: async () => {
      const res = await fetch("/api/industries");
      if (!res.ok) throw new Error("Failed to fetch industries");
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
      const res = await fetch("/api/industries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create industry");
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
      const res = await fetch(`/api/industries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update industry");
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
      const res = await fetch(`/api/industries/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete industry");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}
