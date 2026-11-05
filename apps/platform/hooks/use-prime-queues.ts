"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import type { Order } from "@/types/order";
import { usePrimeBoard, type PrimeBoardData, type PrimeBoardOrder } from "@/hooks/use-prime-board";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { primeProblemsFrom, type PrimeProblem } from "@/lib/prime/problems";
import { primeQueueOf, primeQueues, type PrimeQueue, type PrimeQueueId } from "@/lib/prime/queues";
import type { PrimeShipmentView } from "@/lib/prime/chip-state";
import { useOrderStore } from "@/store/use-order-store";

export interface PrimeQueues {
    connected: boolean;
    queues: Record<PrimeQueueId, PrimeQueue> | null;
    /** The parcels and their orders the queues were read from, for the card strips. */
    data: PrimeBoardData | null;
}

/**
 * The «معالجة» and «راجع» queues (lib/prime/queues.ts), read from the Prime
 * board's shipments rather than the list: the list holds one date window,
 * and a parcel waiting on someone can be from any day.
 */
export function usePrimeQueues(): PrimeQueues {
    const { connected } = usePrimeConnection();
    const { data } = usePrimeBoard(connected);
    const queues = useMemo(() => (data ? primeQueues(primeProblemsFrom(data.views, data.orders, data.readAt)) : null), [data]);
    return { connected, queues, data };
}

export interface PrimeQueueEntry {
    queue: PrimeQueueId;
    problem: PrimeProblem;
    view: PrimeShipmentView;
    order: PrimeBoardOrder;
}

/**
 * The order's place in the Prime queue that is on (its problem, parcel and
 * board order), or null when no queue is on or the order is not in it.
 */
export function usePrimeQueueEntry(orderId: string): PrimeQueueEntry | null {
    const queue = useOrderStore((s) => s.primeQueue);
    const { queues, data } = usePrimeQueues();
    if (!queue || !queues || !data) return null;
    const problem = queues[queue].problems.find((p) => p.orderId === orderId);
    const view = data.views.get(orderId);
    const order = data.orders.get(orderId);
    if (!problem || !view || !order || primeQueueOf(problem) !== queue) return null;
    return { queue, problem, view, order };
}

/**
 * The orders of the chosen Prime queue, in the queue's order, or null while
 * no queue is chosen. Rows the list already holds are shown as the live copy
 * (realtime and optimistic updates patch it), like search results.
 */
export function usePrimeQueueOrders(queue: PrimeQueueId | null, liveOrders: readonly Order[]): Order[] | null {
    const { session, clientReady, tenantId } = useAuth();
    const { queues } = usePrimeQueues();
    const ids = queue && queues ? queues[queue].orderIds : EMPTY_IDS;
    const query = useQuery({
        queryKey: [...orderKeys.lists(), "prime-queue", tenantId, queue, ids],
        enabled: queue !== null && queues !== null && !!session && clientReady && !!tenantId,
        staleTime: 15_000,
        placeholderData: keepPreviousData,
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return orderRepository.findByIds(tenantId, ids);
        },
    });
    return useMemo(() => {
        if (queue === null) return null;
        const live = new Map<string, Order>();
        for (const o of liveOrders) live.set(o.id, o);
        const fetched = new Map<string, Order>();
        for (const o of query.data ?? []) fetched.set(o.id, o);
        const rows: Order[] = [];
        for (const id of ids) {
            const row = live.get(id) ?? fetched.get(id);
            if (row) rows.push(row);
        }
        return rows;
    }, [queue, ids, liveOrders, query.data]);
}

const EMPTY_IDS: readonly string[] = [];
