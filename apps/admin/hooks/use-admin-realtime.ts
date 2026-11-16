"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@supabase/ssr";
import { useRealtimePulse } from "@/store/use-realtime-pulse";

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
    ["admin", "merchants"],
  ],
  wallet_transactions: [
    ["admin", "dashboard-v2"],
    ["admin", "billing"],
    ["admin", "merchants"],
  ],
  subscriptions: [
    ["admin", "dashboard-v2"],
    ["admin", "merchants"],
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
  { table: "subscriptions", events: ["UPDATE"] },
  { table: "admin_activity_logs", events: ["INSERT"] },
];

// Tables that carry tenant_id — used to track which merchants got updated
const TENANT_ID_TABLES = new Set([
  "tenants",
  "wallet",
  "wallet_transactions",
  "subscriptions",
]);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 200;
const PULSE_DURATION_MS = 2000;

export function useAdminRealtime() {
  const queryClient = useQueryClient();
  const pendingKeys = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addPulse = useRealtimePulse((s) => s.addPulse);
  const removePulse = useRealtimePulse((s) => s.removePulse);
  const pulseTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  // Track a merchant as recently updated (for pulse glow)
  const markMerchantUpdated = useCallback((tenantId: string) => {
    addPulse(tenantId);

    // Clear previous timer for this tenant if any
    const existing = pulseTimers.current.get(tenantId);
    if (existing) clearTimeout(existing);

    pulseTimers.current.set(
      tenantId,
      setTimeout(() => {
        removePulse(tenantId);
        pulseTimers.current.delete(tenantId);
      }, PULSE_DURATION_MS)
    );
  }, [addPulse, removePulse]);

  // Schedule (or re-schedule) a debounced flush
  const scheduleInvalidation = useCallback(
    (table: string, payload?: Record<string, unknown>) => {
      const queryKeys = INVALIDATION_MAP[table];
      if (!queryKeys) return;

      for (const key of queryKeys) {
        pendingKeys.current.add(JSON.stringify(key));
      }

      // Track which merchant was updated for pulse highlight
      if (TENANT_ID_TABLES.has(table) && payload) {
        const tenantId =
          table === "tenants"
            ? (payload.id as string | undefined)
            : (payload.tenant_id as string | undefined);
        if (tenantId) markMerchantUpdated(tenantId);
      }

      // Reset the debounce timer so rapid events are batched
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush, markMerchantUpdated],
  );

  useEffect(() => {
    const supabase = makeBrowserClient();
    if (!supabase) return;

    const channelId = `admin_realtime_${crypto.randomUUID?.() ?? Math.random().toString(36).substring(2, 11) + Date.now().toString(36)}`;

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
          (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
            const row = payload.new ?? payload.old;
            scheduleInvalidation(sub.table, row);
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
      // Clear pending keys to avoid stale flushes on re-mount
      pendingKeys.current.clear();
      // Clear all pulse timers
      for (const timer of pulseTimers.current.values()) {
        clearTimeout(timer);
      }
      pulseTimers.current.clear();
      channel.unsubscribe();
    };
  }, [scheduleInvalidation]);
}
