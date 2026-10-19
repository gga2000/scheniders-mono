"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import { MAX_SEARCH_RESULTS, parseOrderSearchTerm } from "@/lib/order-server-search";
import type { Order } from "@/types/order";

const EMPTY: Order[] = [];

/**
 * Keyed under `orderKeys.lists()` on purpose: that prefix is what every order
 * mutation and realtime resync invalidates, so a status changed from a search
 * result refreshes the result too (same reasoning as duplicateCandidateKeys).
 */
export const orderSearchKeys = {
    all: [...orderKeys.lists(), "search"] as const,
    term: (text: string, limit: number) => [...orderSearchKeys.all, text, limit] as const,
};

export interface ServerOrderSearch {
    /** True when the term is long enough to search; the list should show `orders`. */
    active: boolean;
    /** Ranked matches across every date and status, archived and trashed included. */
    orders: Order[];
    /** A request for the current term has not answered yet. */
    pending: boolean;
    isFetching: boolean;
    error: Error | null;
}

/**
 * Server-side order search for a term (already debounced by the caller).
 *
 * `liveOrders` are the rows the page holds for its window. A match that is also
 * one of those is shown as the live copy: realtime and optimistic updates patch
 * the live copy, so a status changed from a search result shows at once instead
 * of after the search refetches.
 */
export function useServerOrderSearch(
    term: string | null | undefined,
    { limit = MAX_SEARCH_RESULTS, liveOrders }: { limit?: number; liveOrders?: readonly Order[] } = {},
): ServerOrderSearch {
    const { session, clientReady, tenantId } = useAuth();
    const parsed = useMemo(() => parseOrderSearchTerm(term), [term]);
    const text = parsed?.text ?? "";

    const query = useQuery({
        queryKey: orderSearchKeys.term(text, limit),
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return orderRepository.search(tenantId, text, limit);
        },
        enabled: parsed !== null && !!session && clientReady && !!tenantId,
        staleTime: 15_000,
        gcTime: 60_000,
        // Keep the previous term's matches on screen while the next term loads,
        // rather than flashing an empty list between keystrokes.
        placeholderData: keepPreviousData,
    });

    const orders = useMemo(() => {
        if (!parsed || !query.data) return EMPTY;
        if (!liveOrders || liveOrders.length === 0) return query.data;
        const live = new Map<string, Order>();
        for (const o of liveOrders) live.set(o.id, o);
        return query.data.map((match) => live.get(match.id) ?? match);
    }, [parsed, query.data, liveOrders]);

    return {
        active: parsed !== null,
        orders,
        pending: parsed !== null && (query.isPending || query.isPlaceholderData),
        isFetching: query.isFetching,
        error: query.error,
    };
}
