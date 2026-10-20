"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import type { Order } from "@/types/order";

/**
 * Keyed under `orderKeys.lists()` so every order mutation and realtime resync
 * that invalidates the list refreshes these too (same reasoning as
 * `orderSearchKeys`).
 */
export const linkedOrderKeys = {
    all: [...orderKeys.lists(), "linked"] as const,
    ids: (tenantId: string | null, ids: readonly string[]) => [...linkedOrderKeys.all, tenantId, ids] as const,
};

const EMPTY: ReadonlyMap<string, Order> = new Map();

/**
 * The orders a set of chat threads link to, by order uuid.
 *
 * The orders context holds only the /orders date window (default: today), so
 * looking a thread's order up there found nothing for any order placed on
 * another day: the thread lost its status, price and action bar. Orders that
 * ARE in the window are taken from it — that copy is the one realtime and
 * optimistic updates patch — and only the rest are fetched.
 */
export function useLinkedOrders(ids: readonly string[]): ReadonlyMap<string, Order> {
    const { session, clientReady, tenantId } = useAuth();
    const { orders } = useOrdersContext();

    const live = useMemo(() => {
        const wanted = new Set(ids);
        const map = new Map<string, Order>();
        for (const o of orders) if (wanted.has(o.id)) map.set(o.id, o);
        return map;
    }, [ids, orders]);

    const missing = useMemo(
        () => [...new Set(ids)].filter((id) => !live.has(id)).sort(),
        [ids, live],
    );

    const { data: fetched } = useQuery({
        queryKey: linkedOrderKeys.ids(tenantId, missing),
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return orderRepository.findByIds(tenantId, missing);
        },
        enabled: missing.length > 0 && !!session && clientReady && !!tenantId,
        staleTime: 60_000,
    });

    return useMemo(() => {
        if (ids.length === 0) return EMPTY;
        const map = new Map(live);
        for (const o of fetched ?? []) if (!map.has(o.id)) map.set(o.id, o);
        return map;
    }, [ids.length, live, fetched]);
}
