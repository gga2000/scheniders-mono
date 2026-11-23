"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { answerLostWords } from "@/lib/answer-lost";
import { sendStep } from "@/lib/send-json";
import type { AdminRole } from "@/types/admin";

export interface AddAdminUserInput {
  email: string;
  displayName?: string;
  adminRole: AdminRole;
  /** Required only when creating a brand-new account; optional reset otherwise. */
  password?: string;
}

/** Grant admin-console access (links an existing user or creates a new one). */
export function useAddAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: AddAdminUserInput) => {
      return sendStep<unknown>("/api/admin-users", data, "POST", answerLostWords("the team list"), "Could not add the staff member.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-team"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}
