"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Order } from "@/lib/supabase";
import { orderKeys, syncOrdersDelta } from "@/hooks/use-orders-query";
import { getSyncWatermark } from "@/hooks/orders-list-coverage";
import { orderRepository } from "@/lib/repositories/order-repository";
import { diag } from "@/lib/diag";
import { useAuth } from "@/components/auth/auth-provider";

// =============================================
// REALTIME HEARTBEAT
// Lightweight check every 30s to detect silent
// Supabase Realtime disconnections: one
// single-row read of the tenant's newest
// updated_at, and a catch-up delta only when
// the cache is behind it.
// =============================================

interface UseRealtimeHeartbeatOptions {
    /** Interval between heartbeats in ms (default: 30000) */
    intervalMs?: number;
    /** Whether heartbeat is enabled (default: true) */
    enabled?: boolean;
}

/** Parse an ISO stamp; NaN (an unusable value) counts as nothing known. */
function stampMs(iso: string | null | undefined): number {
    const ms = iso ? Date.parse(iso) : Number.NaN;
    return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

export function useRealtimeHeartbeat({
    intervalMs = 30_000,
    enabled = true,
}: UseRealtimeHeartbeatOptions = {}) {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isCheckingRef = useRef(false);

    const checkHeartbeat = useCallback(async () => {
        // Prevent overlapping checks
        if (isCheckingRef.current) return;
        // The cache holds one tenant's orders; compare against that tenant only.
        if (!tenantId) return;
        isCheckingRef.current = true;

        try {
            // 1. The tenant's newest change — archived and trashed rows
            //    included, the same rows a delta reads and the watermark covers.
            const serverLatest = await orderRepository.findLatestUpdatedAt(tenantId);
            if (!serverLatest) return;

            // 2. Nothing loaded yet: the first fetch is the sync.
            const cachedOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());
            if (!cachedOrders) return;

            // 3. What the cache is known to hold: the sync watermark (a complete
            //    delta raises it past trashed and out-of-window rows, which the
            //    cache never keeps) or its newest row (realtime raises that).
            //    The cached rows alone saw permanent drift whenever the newest
            //    change was a row the cache does not keep.
            let clientLatest = stampMs(getSyncWatermark(queryClient)?.at);
            for (const o of cachedOrders) clientLatest = Math.max(clientLatest, stampMs(o.updated_at));

            // 4. If the server is ahead by more than 5 seconds, we missed updates.
            const drift = stampMs(serverLatest) - clientLatest;
            diag.log(`[Diag:Heartbeat] CHECK drift=${Math.round(drift / 1000)}s serverLatest=${serverLatest} clientLatest=${Number.isFinite(clientLatest) ? new Date(clientLatest).toISOString() : "none"}`);
            if (drift > 5_000) {
                diag.log(`[Diag:Heartbeat] DRIFT reason=cacheDrift drift=${Math.round(drift / 1000)}s — incremental delta sync`);
                await syncOrdersDelta(queryClient, tenantId, "heartbeatDrift");
            }
        } catch (err) {
            // Non-critical: the next beat retries, and focus/reconnect sync too.
            diag.warn("[Diag:Heartbeat] check failed", err);
        } finally {
            isCheckingRef.current = false;
        }
    }, [queryClient, tenantId]);

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
