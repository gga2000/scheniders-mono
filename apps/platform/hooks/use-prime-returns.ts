"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { primeShipmentsKey } from "@/hooks/use-prime-shipments";
import { supabase } from "@/lib/supabase";
import { primeReturnsSummary, type PrimeReturnsGroup, type PrimeReturnsSummary } from "@/lib/prime/returns";

const groupSchema = z
    .object({
        shipment_status: z.string().nullable(),
        step_code: z.string().nullable(),
        cancelled: z.boolean(),
        resent: z.boolean(),
        governorate: z.string().nullable(),
        reason: z.string().nullable(),
        changed_day: z.string(),
        parcels: z.coerce.number(),
        // Added by migration 20261105080900; absent until it is applied.
        deliver_hours: z.coerce.number().nullish(),
    })
    .transform(
        (r): PrimeReturnsGroup => ({
            shipmentStatus: r.shipment_status,
            stepCode: r.step_code,
            cancelled: r.cancelled,
            resent: r.resent,
            governorate: r.governorate,
            reason: r.reason,
            changedDay: r.changed_day,
            parcels: r.parcels,
            deliverHours: r.deliver_hours ?? undefined,
        }),
    );

/**
 * Why the store's Prime parcels come back: the last 60 days grouped in the
 * database (prime_returns_groups) and read here with the order card's rules.
 * Under the Prime shipments key, so it refreshes with the other Prime views.
 */
export function usePrimeReturns(enabled: boolean) {
    const { session, clientReady, tenantId } = useAuth();
    const query = useQuery({
        queryKey: [...primeShipmentsKey(tenantId), "returns"],
        enabled: enabled && !!session && clientReady && !!tenantId,
        staleTime: 5 * 60_000,
        queryFn: async () => {
            if (!tenantId) throw new Error("No active tenant");
            const { data, error } = await supabase.rpc("prime_returns_groups", { p_tenant_id: tenantId });
            if (error) throw error;
            return z.array(groupSchema).parse(data ?? []);
        },
    });

    const summary = useMemo((): PrimeReturnsSummary | null => (query.data ? primeReturnsSummary(query.data, query.dataUpdatedAt) : null), [query.data, query.dataUpdatedAt]);
    return { summary, isPending: query.isPending, isError: query.isError, refetch: query.refetch };
}
