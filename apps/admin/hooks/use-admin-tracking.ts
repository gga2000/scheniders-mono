"use client";

import { useMutation } from "@tanstack/react-query";
import { adminFetch } from "@/lib/admin-fetch";

export function useAdminTracking() {
  return useMutation({
    mutationFn: async ({
      admin_user_id,
      action,
      entity_type,
      entity_id,
      metadata,
    }: {
      admin_user_id: string;
      action: string;
      entity_type?: string;
      entity_id?: string;
      metadata?: Record<string, unknown>;
    }) => {
      try {
        await adminFetch("/api/team/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_user_id, action, entity_type, entity_id, metadata }),
        });
      } catch (err) {
        // Tracking should never break the app, but log for diagnostics
        console.warn("[admin-tracking] Failed to send tracking event:", err);
      }
    },
  });
}
