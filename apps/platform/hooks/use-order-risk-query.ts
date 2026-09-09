"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderRepository, type OrderRisk } from "@/lib/repositories/order-repository";

const EMPTY: ReadonlyMap<string, OrderRisk> = new Map();

/**
 * PERF-D1. `risk_data` was 28.2% of the order-list payload — 2,803,916 of
 * 9,951,233 bytes on the largest tenant — and was fetched on every route,
 * although only the orders route and the returns panel read it. It now loads
 * separately, so the other nine consumers of the order book stop paying for it.
 *
 * Returns an empty map while loading. Every call site already treats a missing
 * assessment as "low", so there is no loading state to render.
 */
export function useOrderRiskQuery(): ReadonlyMap<string, OrderRisk> {
    const { session, clientReady } = useAuth();
    const { data } = useQuery({
        queryKey: ["orders", "risk"],
        queryFn: () => orderRepository.findRiskData(),
        enabled: !!session && clientReady,
        staleTime: 5 * 60 * 1000,
    });
    return data ?? EMPTY;
}

/** One order's risk — for detail panels, which must not pull the whole map. */
export function useOrderRisk(orderId: string | null | undefined): OrderRisk | null {
    const { session, clientReady } = useAuth();
    const { data } = useQuery({
        queryKey: ["orders", "risk", orderId],
        queryFn: () => orderRepository.findRiskFor(orderId as string),
        enabled: !!session && clientReady && !!orderId,
        staleTime: 5 * 60 * 1000,
    });
    return data ?? null;
}
