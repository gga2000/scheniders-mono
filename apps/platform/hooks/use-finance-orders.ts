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
            return orderRepository.findWindow(tenantId, windowFromDateFilter(fromDay, toDay));
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
