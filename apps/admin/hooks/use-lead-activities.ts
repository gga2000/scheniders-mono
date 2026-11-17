"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadActivityType } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";
import { refusal } from "@/lib/refusal";

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      activity_type,
      title,
      description,
    }: {
      leadId: string;
      activity_type: LeadActivityType;
      title: string;
      description?: string;
    }) => {
      const res = await adminFetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_type, title, description }),
      });
      if (!res.ok) throw new Error(await refusal(res, "Could not save it. Try again."));
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
    // A refusal may mean a colleague deleted the lead: read it again, so the
    // page says so (lead-detail's "deleted" state).
    onError: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}
