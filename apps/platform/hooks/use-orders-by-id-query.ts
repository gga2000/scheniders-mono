"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";

/** The fields chat reads off a linked order. Deliberately not `Order`: this row
 *  is six columns, and calling it a full order is how ARCH-D3 happened. */
export interface LinkedOrder {
    /** Conflict token — the order write path guards on this, not updated_at. */
    version?: number;
    id: string;
    order_id: string;
    customer_name: string | null;
    phone: string | null;
    status: string;
    price: number | null;
    /** OrderActionBar reads these two; nothing else in chat does. */
    assigned_to: string | null;
    updated_at: string;
}

const EMPTY: ReadonlyMap<string, LinkedOrder> = new Map();

/**
 * PERF-D1. The orders a set of conversations link to.
 *
 * `conversation-list` is mounted in the root layout and built a
 * `Map<order.id, Order>` over the ENTIRE order book in order to read `status`
 * and `price` off the few conversations that are order threads. It was the last
 * consumer pinning OrdersProvider to the layout.
 */
export function useOrdersByIdQuery(ids: string[]): ReadonlyMap<string, LinkedOrder> {
    const key = useMemo(() => [...new Set(ids)].sort(), [ids]);
    const { session, clientReady } = useAuth();

    const { data } = useQuery({
        queryKey: ["orders", "byId", key],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("v_orders_with_risk")
                .select("id, order_id, customer_name, phone, status, price, assigned_to, updated_at")
                .in("id", key);
            if (error) throw error;
            return (data ?? []) as LinkedOrder[];
        },
        enabled: !!session && clientReady && key.length > 0,
        staleTime: 60 * 1000,
    });

    return useMemo(
        () => (data ? new Map(data.map((o) => [o.id, o])) : EMPTY),
        [data]
    );
}
