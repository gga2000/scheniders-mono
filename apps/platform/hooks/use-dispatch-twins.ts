"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { orderRepository } from "@/lib/repositories/order-repository";
import { buildDuplicateWindowIndex, committedTwinBlockingConfirm, DUPLICATE_WINDOW_HOURS } from "@/lib/duplicate-window";
import type { Order } from "@/lib/supabase";

const WINDOW_MS = DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * The desk's 48h double-dispatch check (lib/duplicate-window): the confirmed
 * queue plus the orders already out since 48h before its oldest order, so a
 * customer whose earlier order is with the courier is caught too.
 */
export function useDispatchTwins(queue: readonly Order[]): (orderId: string) => Order | undefined {
    const { session, clientReady, tenantId } = useAuth();

    const sinceIso = useMemo(() => {
        const times = queue.map((o) => Date.parse(o.created_at)).filter((ms) => !Number.isNaN(ms));
        return times.length === 0 ? null : new Date(Math.min(...times) - WINDOW_MS).toISOString();
    }, [queue]);

    const shipped = useQuery({
        queryKey: ["dispatch-twins", tenantId, sinceIso],
        queryFn: () => {
            if (!tenantId || !sinceIso) throw new Error("No active tenant");
            return orderRepository.findShippedSince(tenantId, sinceIso);
        },
        enabled: Boolean(session && clientReady && tenantId && sinceIso),
        staleTime: 60_000,
    });

    const index = useMemo(() => {
        const byId = new Map<string, Order>();
        for (const o of shipped.data ?? []) byId.set(o.id, o);
        for (const o of queue) byId.set(o.id, o);
        return buildDuplicateWindowIndex([...byId.values()]);
    }, [queue, shipped.data]);

    return useCallback((orderId: string) => committedTwinBlockingConfirm(orderId, index), [index]);
}
