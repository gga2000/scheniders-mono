"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { supabase, type Order } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { normalizePhoneForSearch } from "@/lib/order-utils";

/** One row of public.get_customer_order_counts. */
const CountRows = z.array(z.object({ normalized_phone: z.string(), order_count: z.number() }));

/**
 * Each customer's order count over the whole book, from the server.
 *
 * The "N طلبات" chip used to count only the rows the page had loaded. Since
 * the fetch is windowed to the date filter (today by default), a customer
 * whose earlier order fell outside the window showed no chip at all — exactly
 * the under-reporting `get_customer_order_counts` was written to prevent
 * (migration 20260901221806). Same rules as lib/order-duplicates.ts: archived,
 * deleted and return orders are skipped, and an order counts once per base id.
 *
 * `version` goes in the key so a list that gains or loses rows (a new order
 * arriving, one archived) asks again instead of serving the old count.
 */
export function useCustomerOrderCounts(orders: readonly Pick<Order, "phone">[], version: number) {
    const { tenantId } = useAuth();

    const phones = useMemo(() => {
        const set = new Set<string>();
        for (const o of orders) {
            const normalized = normalizePhoneForSearch(o.phone);
            if (normalized) set.add(normalized);
        }
        return [...set].sort();
    }, [orders]);

    const { data } = useQuery({
        queryKey: ["orders", "customer-order-counts", tenantId, phones, version],
        queryFn: async (): Promise<Map<string, number>> => {
            if (!tenantId) throw new Error("No active tenant");
            const { data, error } = await supabase.rpc("get_customer_order_counts", {
                _tenant_id: tenantId,
                _phones: phones,
            });
            if (error) throw error;
            return new Map(CountRows.parse(data ?? []).map((row) => [row.normalized_phone, row.order_count]));
        },
        enabled: !!tenantId && phones.length > 0,
        placeholderData: keepPreviousData,
        staleTime: 60_000,
    });

    return data;
}
