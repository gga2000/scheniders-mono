"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/admin-fetch";
import { refusal } from "@/lib/refusal";

export function useCreateFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      ...data
    }: {
      leadId: string;
      scheduled_at: string;
      title: string;
      description?: string;
      assigned_to?: string;
    }) => {
      const res = await adminFetch(`/api/leads/${leadId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await refusal(res, "Could not save the follow-up."));
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}

export function useCompleteFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, followUpId }: { leadId: string; followUpId: string }) => {
      const res = await adminFetch(`/api/leads/${leadId}/follow-ups/${followUpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: true }),
      });
      if (!res.ok) throw new Error(await refusal(res, "Could not mark the follow-up done."));
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}
