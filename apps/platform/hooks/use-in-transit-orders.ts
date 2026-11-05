"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import type { Order } from "@/types/order";

export interface InTransitOrders {
    /** In-transit orders the date window does not hold: the rows the «قيد التوصيل» tab adds. */
    extras: Order[];
    /** Every in-transit order has been read (the tab's list and count are complete). */
    loaded: boolean;
}

const NONE: InTransitOrders = { extras: [], loaded: true };

/**
 * Every in-transit order of the tenant, whatever day it arrived. The orders
 * list holds one date window, but a parcel on the road is work for the desk
 * on any day, so the «قيد التوصيل» tab reads them across every date. Rows the
 * list already holds are its live copy (realtime and optimistic updates patch
 * it), so only the rest are returned here.
 */
export function useInTransitOrders(enabled: boolean, liveOrders: readonly Order[]): InTransitOrders {
    const { session, clientReady, tenantId } = useAuth();
    const query = useQuery({
        queryKey: [...orderKeys.lists(), "in-transit", tenantId],
        enabled: enabled && !!session && clientReady && !!tenantId,
        staleTime: 15_000,
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return orderRepository.findInTransit(tenantId);
        },
    });
    return useMemo(() => {
        if (!enabled) return NONE;
        const live = new Set<string>();
        for (const o of liveOrders) live.add(o.id);
        return {
            extras: (query.data ?? []).filter((o) => !live.has(o.id)),
            loaded: query.data !== undefined,
        };
    }, [enabled, liveOrders, query.data]);
}
