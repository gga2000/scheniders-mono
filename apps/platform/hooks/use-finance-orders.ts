"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderRepository } from "@/lib/repositories/order-repository";
import { baghdadDayKey, windowFromDateFilter } from "@/lib/order-window";
import type { Order } from "@/types/order";

/** The cash tab charts the last 30 days whatever period is picked. */
const CASH_LOOKBACK_DAYS = 29;
const DAY_MS = 24 * 60 * 60 * 1000;

interface FinanceOrdersRange {
    start: Date;
    end: Date;
    compareStart?: Date | null;
}

/**
 * The orders the finances page computes from: the picked period, its compare
 * period and the cash tab's 30 days, read from the server on their own.
 *
 * The order book (`useOrdersContext`) holds ONE date window, the one the
 * merchant last filtered the Orders page to (Today by default). Finances used
 * to read it, so "Last 30 days" reported whatever that window happened to hold
 * — audit ORD-2 measured 108,810,650 IQD cash collected against 0 under a
 * one-day window. This query is keyed by its own days and never touches the book.
 */
export function useFinanceOrders({ start, end, compareStart }: FinanceOrdersRange) {
    const { tenantId } = useAuth();

    const { fromDay, toDay } = useMemo(() => {
        const now = Date.now();
        const earliest = Math.min(start.getTime(), compareStart?.getTime() ?? Infinity, now - CASH_LOOKBACK_DAYS * DAY_MS);
        return { fromDay: baghdadDayKey(earliest), toDay: baghdadDayKey(Math.max(end.getTime(), now)) };
    }, [start, end, compareStart]);

    const query = useQuery({
        queryKey: ["finance-orders", tenantId, fromDay, toDay],
        queryFn: async (): Promise<Order[]> => {
            if (!tenantId) throw new Error("No active tenant");
            const [placed, refundsPaid] = await Promise.all([
                orderRepository.findWindow(tenantId, windowFromDateFilter(fromDay, toDay), { withRisk: false }),
                orderRepository.findRefundsPaidBetween(tenantId, fromDay, toDay),
            ]);
            // A refund paid in the range but created before it is filed on its
            // payment day, so it has to be read even though the window misses it.
            const seen = new Set(placed.map((o) => o.id));
            return [...placed, ...refundsPaid.filter((o) => !seen.has(o.id))];
        },
        enabled: !!tenantId,
        // A new period keeps the old rows on screen instead of blanking the page.
        placeholderData: keepPreviousData,
        staleTime: 60_000,
    });

    return {
        orders: query.data ?? EMPTY,
        loading: query.isPending,
        error: query.error ? (query.error instanceof Error ? query.error.message : "Failed to load orders") : null,
    };
}

const EMPTY: Order[] = [];

/** The statuses of a sale whose cash is still on the road. */
const ON_THE_ROAD: ReadonlySet<Order["status"]> = new Set<Order["status"]>(["confirmed", "in_transit"]);

/**
 * Every confirmed or in-transit order of the shop, whatever day it was placed.
 * The period read above stops at its first day, so a parcel out for 40 days
 * was missing from a 7-day view while still counting in a 60-day one.
 */
export function useOnTheRoadOrders() {
    const { tenantId } = useAuth();
    const query = useQuery({
        queryKey: ["finance-orders", tenantId, "on-the-road"],
        queryFn: (): Promise<Order[]> => {
            if (!tenantId) throw new Error("No active tenant");
            return orderRepository.findOnTheRoad(tenantId);
        },
        enabled: !!tenantId,
        staleTime: 60_000,
    });
    return {
        orders: query.data ?? EMPTY,
        loading: query.isPending,
        error: query.error ? (query.error instanceof Error ? query.error.message : "Failed to load orders") : null,
    };
}

/**
 * The period's orders with their open ones swapped for every open order the
 * shop has: delivered, refused and refund rows stay as the period read them,
 * and the money on the road comes from one list on every card.
 */
export function withOnTheRoad(orders: readonly Order[], onTheRoad: readonly Order[]): Order[] {
    const settled = orders.filter((o) => !ON_THE_ROAD.has(o.status));
    const seen = new Set(settled.map((o) => o.id));
    return [...settled, ...onTheRoad.filter((o) => !seen.has(o.id))];
}
