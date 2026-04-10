"use client";

import { useMutation } from "@tanstack/react-query";

export function useAdminTracking() {
  return useMutation({
    mutationFn: async ({
      action,
      entity_type,
      entity_id,
      metadata,
    }: {
      action: string;
      entity_type?: string;
      entity_id?: string;
      metadata?: Record<string, unknown>;
    }) => {
      // Fire and forget - don't block UI for tracking
      fetch("/api/team/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, entity_type, entity_id, metadata }),
      }).catch(() => {
        // Silently fail - tracking should never break the app
      });
    },
  });
}
