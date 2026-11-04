"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { primeShipmentsKey } from "@/hooks/use-prime-shipments";
import { supabase } from "@/lib/supabase";
import { primeHomeSummary, type PrimeHomeGroup, type PrimeHomeSummary } from "@/lib/prime/home";

const REFRESH_MS = 5 * 60_000;

const groupSchema = z
    .object({
        shipment_status: z.string().nullable(),
        step_code: z.string().nullable(),
        cancelled: z.boolean(),
        paid: z.boolean(),
        order_open: z.boolean(),
        sent_day: z.string(),
        changed_day: z.string(),
        parcels: z.coerce.number(),
        collect: z.coerce.number(),
        fees: z.coerce.number(),
    })
    .transform(
        (r): PrimeHomeGroup => ({
            shipmentStatus: r.shipment_status,
            stepCode: r.step_code,
            cancelled: r.cancelled,
            paid: r.paid,
            orderOpen: r.order_open,
            sentDay: r.sent_day,
            changedDay: r.changed_day,
            parcels: r.parcels,
            collect: r.collect,
            fees: r.fees,
        }),
    );

/**
 * The home page's Prime money and delivery rate: the store's Prime parcels
 * of the last 60 days, grouped in the database (prime_home_groups) and read
 * here with the order card's rules. Under the Prime shipments key, so it
 * refreshes with the rest of the Prime views.
 */
export function usePrimeHome(enabled: boolean) {
    const { session, clientReady, tenantId } = useAuth();
    const query = useQuery({
        queryKey: [...primeShipmentsKey(tenantId), "home"],
        enabled: enabled && !!session && clientReady && !!tenantId,
        staleTime: 60_000,
        refetchInterval: REFRESH_MS,
        queryFn: async () => {
            if (!tenantId) throw new Error("No active tenant");
            const { data, error } = await supabase.rpc("prime_home_groups", { p_tenant_id: tenantId });
            if (error) throw error;
            return z.array(groupSchema).parse(data ?? []);
        },
    });

    const summary = useMemo((): PrimeHomeSummary | null => (query.data ? primeHomeSummary(query.data, query.dataUpdatedAt) : null), [query.data, query.dataUpdatedAt]);
    return { summary, isPending: query.isPending, isError: query.isError, refetch: query.refetch };
}
