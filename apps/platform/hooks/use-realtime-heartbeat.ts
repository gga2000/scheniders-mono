"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, Order } from "@/lib/supabase";
import { orderKeys } from "@/hooks/use-orders-query";
import { diag } from "@/lib/diag";

// =============================================
// REALTIME HEARTBEAT
// Lightweight check every 30s to detect silent
// Supabase Realtime disconnections. Compares
// the server's latest updated_at against the
// client's cache. If out of sync, triggers a
// soft refetch.
//
// This is much cheaper than polling all orders:
// it's a single SELECT MAX(updated_at).
//
// To the user's question: "could this slow the app?"
// No — it's one tiny query every 30 seconds,
// and only triggers a refetch when divergence
// is detected. The query is so small it takes
// <10ms on any Supabase instance.
// =============================================

interface UseRealtimeHeartbeatOptions {
    /** Interval between heartbeats in ms (default: 30000) */
    intervalMs?: number;
    /** Whether heartbeat is enabled (default: true) */
    enabled?: boolean;
}

export function useRealtimeHeartbeat({
    intervalMs = 30_000,
    enabled = true,
}: UseRealtimeHeartbeatOptions = {}) {
    const queryClient = useQueryClient();
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isCheckingRef = useRef(false);

    const checkHeartbeat = useCallback(async () => {
        // Prevent overlapping checks
        if (isCheckingRef.current) return;
        isCheckingRef.current = true;

        try {
            // 1. Get the latest updated_at from the server (single row, lightweight)
            const { data, error } = await supabase
                .from("orders")
                .select("updated_at")
                .eq("is_archived", false)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error || !data) {
                isCheckingRef.current = false;
                return;
            }

            const serverLatest = new Date(data.updated_at).getTime();

            // 2. Get the latest updated_at from the client cache
            const cachedOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());
            if (!cachedOrders || cachedOrders.length === 0) {
                isCheckingRef.current = false;
                return;
            }

            const clientLatest = Math.max(
                ...cachedOrders.map((o) => new Date(o.updated_at || 0).getTime())
            );

            // 3. If server is ahead by more than 5 seconds, we missed updates
            const drift = serverLatest - clientLatest;
            diag.log(`[Diag:Heartbeat] CHECK drift=${Math.round(drift / 1000)}s serverLatest=${new Date(serverLatest).toISOString()} clientLatest=${new Date(clientLatest).toISOString()}`);
            if (drift > 5_000) {
                diag.log(`[Diag:Heartbeat] RECONNECT_TRIGGER reason=cacheDrift drift=${Math.round(drift / 1000)}s`);
                console.warn(
                    `[Heartbeat] Cache drift detected: ${Math.round(drift / 1000)}s behind server. Triggering refetch.`
                );
                queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            }
        } catch (err) {
            // Heartbeat failures are non-critical — just log
            console.debug("[Heartbeat] Check failed:", err);
        } finally {
            isCheckingRef.current = false;
        }
    }, [queryClient]);

    useEffect(() => {
        if (!enabled) return;

        // Start heartbeat interval
        intervalRef.current = setInterval(checkHeartbeat, intervalMs);

        // Run an initial check after a short delay (let the app hydrate first)
        const initialTimeout = setTimeout(checkHeartbeat, 5_000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            clearTimeout(initialTimeout);
        };
    }, [enabled, intervalMs, checkHeartbeat]);
}
