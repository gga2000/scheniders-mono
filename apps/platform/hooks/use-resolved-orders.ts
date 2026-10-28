"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderRepository } from "@/lib/repositories/order-repository";
import type { Order } from "@/types/order";

/**
 * The orders behind a set of selected ids, for a confirmation that must name
 * every one of them.
 *
 * A selection is not limited to the loaded window: rows picked from a server
 * search can be from any date, and a selection survives clearing the search.
 * Looking ids up only in the window left the delete confirmation listing
 * nothing for them. Ids found in `known` (the window, the search results) are
 * used as they are; the rest are read from the server. An id the server no
 * longer has (trashed meanwhile) is counted in `missing`.
 */
export function useResolvedOrders(
    ids: ReadonlySet<string>,
    known: readonly (readonly Order[])[],
    enabled: boolean,
): { orders: Order[]; pending: boolean; missing: number } {
    const { tenantId } = useAuth();

    const local = useMemo(() => {
        const map = new Map<string, Order>();
        for (const list of known) for (const order of list) if (ids.has(order.id)) map.set(order.id, order);
        return map;
    }, [ids, known]);

    const unresolved = useMemo(() => [...ids].filter((id) => !local.has(id)).sort(), [ids, local]);

    const query = useQuery({
        queryKey: ["orders", "resolve-selection", tenantId, unresolved],
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return orderRepository.findByIds(tenantId, unresolved);
        },
        enabled: enabled && !!tenantId && unresolved.length > 0,
        staleTime: 30_000,
    });

    return useMemo(() => {
        const fetched = new Map((query.data ?? []).map((o) => [o.id, o]));
        const orders: Order[] = [];
        let missing = 0;
        for (const id of ids) {
            const order = local.get(id) ?? fetched.get(id);
            if (order) orders.push(order);
            else if (query.isSuccess) missing++;
        }
        return { orders, pending: unresolved.length > 0 && query.isPending, missing };
    }, [ids, local, query.data, query.isSuccess, query.isPending, unresolved.length]);
}
