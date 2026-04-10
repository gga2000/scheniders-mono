"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

// ---------------------------------------------------------------------------
// Invalidation map — which query keys to invalidate per table
// ---------------------------------------------------------------------------

const INVALIDATION_MAP: Record<string, readonly (readonly string[])[]> = {
  tenants: [
    ["admin", "dashboard-v2"],
    ["admin", "merchants"],
    ["admin", "health"],
  ],
  wallet: [
    ["admin", "dashboard-v2"],
    ["admin", "billing"],
  ],
  wallet_transactions: [
    ["admin", "dashboard-v2"],
    ["admin", "billing"],
  ],
  admin_activity_logs: [
    ["admin", "dashboard-v2"],
    ["admin", "activity"],
  ],
};

// ---------------------------------------------------------------------------
// Subscription config — table name + which postgres_changes events to listen to
// ---------------------------------------------------------------------------

const SUBSCRIPTIONS: {
  table: string;
  events: ("INSERT" | "UPDATE" | "DELETE")[];
}[] = [
  { table: "tenants", events: ["INSERT", "UPDATE", "DELETE"] },
  { table: "wallet", events: ["UPDATE"] },
  { table: "wallet_transactions", events: ["INSERT"] },
  { table: "admin_activity_logs", events: ["INSERT"] },
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 200;

export function useAdminRealtime() {
  const queryClient = useQueryClient();
  const pendingKeys = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable flush function — drains the pending set and invalidates once
  const flush = useCallback(() => {
    timerRef.current = null;
    const keys = Array.from(pendingKeys.current);
    pendingKeys.current.clear();

    for (const serialized of keys) {
      const queryKey: string[] = JSON.parse(serialized);
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);

  // Schedule (or re-schedule) a debounced flush
  const scheduleInvalidation = useCallback(
    (table: string) => {
      const queryKeys = INVALIDATION_MAP[table];
      if (!queryKeys) return;

      for (const key of queryKeys) {
        pendingKeys.current.add(JSON.stringify(key));
      }

      // Reset the debounce timer so rapid events are batched
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    const supabase = makeBrowserClient();
    if (!supabase) return;

    const channelId = `admin_realtime_${Math.random().toString(36).substring(7)}`;

    // Build a single channel with multiple postgres_changes listeners
    let channel = supabase.channel(channelId);

    for (const sub of SUBSCRIPTIONS) {
      for (const event of sub.events) {
        channel = channel.on(
          "postgres_changes" as const,
          {
            event,
            schema: "public" as const,
            table: sub.table,
          },
          () => {
            scheduleInvalidation(sub.table);
          },
        );
      }
    }

    channel.subscribe();

    return () => {
      // Clear any pending debounce timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      channel.unsubscribe();
    };
  }, [scheduleInvalidation]);
}
