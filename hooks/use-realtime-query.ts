"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { RealtimeBatcher } from "@/lib/realtime-batcher";

// =============================================
// GENERIC REALTIME QUERY HOOK
// Combines React Query caching with Supabase
// Realtime subscriptions for any table.
//
// Usage:
//   useRealtimeQuery({
//       table: "orders",
//       queryKey: ["orders", "list"],
//       filter: { column: "is_archived", value: false },
//       normalizer: normalizeOrder,
//       onReconnect: () => refetch(),
//   });
// =============================================

interface UseRealtimeQueryOptions<T> {
    /** Supabase table name to subscribe to */
    table: string;

    /** React Query key to update on events */
    queryKey: readonly unknown[];

    /** Optional normalizer for incoming records */
    normalizer?: (raw: unknown) => T;

    /** Optional filter for the subscription (e.g., only non-archived) */
    filter?: {
        column: string;
        value: string | number | boolean;
    };

    /** Callback when realtime reconnects after a disconnect */
    onReconnect?: () => void;

    /** Callback for new records (e.g., show notification) */
    onInsert?: (record: T) => void;

    /** Batch delay in ms (default: 200) */
    batchDelayMs?: number;

    /** Whether the subscription is enabled (default: true) */
    enabled?: boolean;
}

export function useRealtimeQuery<T extends { id: string }>({
    table,
    queryKey,
    normalizer = (x: unknown) => x as T,
    filter,
    onReconnect,
    onInsert,
    batchDelayMs = 200,
    enabled = true,
}: UseRealtimeQueryOptions<T>) {
    const queryClient = useQueryClient();

    // Use refs for callbacks to avoid re-subscribing on callback changes
    const onReconnectRef = useRef(onReconnect);
    const onInsertRef = useRef(onInsert);
    const normalizerRef = useRef(normalizer);

    useEffect(() => {
        onReconnectRef.current = onReconnect;
        onInsertRef.current = onInsert;
        normalizerRef.current = normalizer;
    }, [onReconnect, onInsert, normalizer]);

    useEffect(() => {
        if (!enabled) return;

        const subscriptionId = Math.random().toString(36).substring(7);
        let hasEverConnected = false;
        let wasDisconnected = false;

        // Create a batcher for this subscription
        const batcher = new RealtimeBatcher({
            queryClient,
            queryKey,
            normalizer: normalizerRef.current,
            flushDelayMs: batchDelayMs,
            onNewOrder: (order) => onInsertRef.current?.(order as unknown as T),
        });

        // Build the subscription config
        const subscriptionConfig: {
            event: "*";
            schema: "public";
            table: string;
            filter?: string;
        } = {
            event: "*",
            schema: "public",
            table,
        };

        // Add optional filter (e.g., "is_archived=eq.false")
        if (filter) {
            subscriptionConfig.filter = `${filter.column}=eq.${filter.value}`;
        }

        const channel = supabase
            .channel(`${table}_changes_${subscriptionId}`)
            .on("postgres_changes", subscriptionConfig, (payload) => {
                // Push to batcher instead of updating cache directly
                batcher.push({
                    eventType: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
                    new: payload.new as Record<string, unknown> | undefined,
                    old: payload.old as Record<string, unknown> | undefined,
                });
            })
            .subscribe((status, err) => {
                if (status === "SUBSCRIBED") {
                    if (hasEverConnected && wasDisconnected) {
                        // True reconnection — flush any pending events and trigger refetch
                        batcher.flush();
                        onReconnectRef.current?.();
                    }
                    hasEverConnected = true;
                    wasDisconnected = false;
                } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
                    wasDisconnected = true;
                }
            });

        return () => {
            batcher.destroy();
            channel.unsubscribe();
        };
    }, [table, enabled, batchDelayMs, queryClient, queryKey]); // queryKey and queryClient are stable
}
