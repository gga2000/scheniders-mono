"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/admin-fetch";
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
      const res = await adminFetch("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add admin employee");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-team"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

/** Revoke admin-console access (removes the admin_users row only). */
export function useRemoveAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await adminFetch(
        `/api/admin-users?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remove admin employee");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-team"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}
