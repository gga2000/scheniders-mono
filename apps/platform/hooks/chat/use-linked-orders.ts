"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
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
 * Fetched by id, never looked up in the order book. Chat is mounted by the root
 * layout, above the routes that mount <OrdersProvider>, so there is no book to
 * read on any route; and the book was only the /orders date window (default:
 * today) anyway, so a thread for an order placed on another day lost its status,
 * price and action bar.
 */
export function useLinkedOrders(ids: readonly string[]): ReadonlyMap<string, Order> {
    const { session, clientReady, tenantId } = useAuth();

    const wanted = useMemo(() => [...new Set(ids)].sort(), [ids]);

    const { data: fetched } = useQuery({
        queryKey: linkedOrderKeys.ids(tenantId, wanted),
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return orderRepository.findByIds(tenantId, wanted);
        },
        enabled: wanted.length > 0 && !!session && clientReady && !!tenantId,
        staleTime: 60_000,
    });

    return useMemo(() => {
        if (wanted.length === 0 || !fetched) return EMPTY;
        return new Map(fetched.map((o) => [o.id, o]));
    }, [wanted.length, fetched]);
}
