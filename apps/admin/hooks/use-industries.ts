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

type IndustryEdit = Partial<Pick<Industry, "name" | "name_ar" | "icon" | "color" | "avg_order_value_iqd" | "is_active">>;

export function useUpdateIndustry() {
  const qc = useQueryClient();
  return useMutation({
    // Not the place in the list: that is useMoveIndustry.
    mutationFn: async ({ id, data }: { id: string; data: IndustryEdit }) => {
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

/**
 * One place up or down. The server moves it, renumbers the list and logs it
 * in one write; the list is read again either way, so it shows where each
 * industry stands.
 */
export function useMoveIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      const res = await adminFetch(`/api/industries/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) throw new Error(await refusal(res, "Could not move the industry."));
      return res.json();
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}

/** What Delete did: an industry leads use is switched off, and they keep it. */
export type IndustryRemoval = { result: "removed" } | { result: "switched_off"; leads_using_it: number };

export function useDeleteIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<IndustryRemoval> => {
      const res = await adminFetch(`/api/industries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await refusal(res, "Could not delete the industry."));
      return res.json();
    },
    // A refused delete ("no longer exists") also means the list is out of date.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}
