"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadActivityType } from "@/types/leads";
import { answerLostWords } from "@/lib/answer-lost";
import { sendStep } from "@/lib/send-json";

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
      return sendStep<unknown>(
        `/api/leads/${leadId}/activities`,
        { activity_type, title, description },
        "POST",
        answerLostWords("the lead's timeline"),
        "Could not save it. Try again.",
      );
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
