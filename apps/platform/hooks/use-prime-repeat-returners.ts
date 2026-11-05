"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { primeShipmentsKey } from "@/hooks/use-prime-shipments";
import { supabase } from "@/lib/supabase";

const rowSchema = z
    .object({ phone: z.string(), customer_name: z.string().nullable(), returned: z.coerce.number(), last_day: z.string() })
    .transform((r) => ({ phone: r.phone, name: r.customer_name?.trim() || null, returned: r.returned, lastDay: r.last_day }));
export type PrimeRepeatReturner = z.infer<typeof rowSchema>;

/**
 * Customers whose Prime parcels came back 2 or more times in the last 60 days
 * (prime_repeat_returners, read under the member's own RLS). The Returns tab
 * links each to the customer's page, where Shield shows what other stores saw.
 */
export function usePrimeRepeatReturners(enabled: boolean) {
    const { session, clientReady, tenantId } = useAuth();
    const query = useQuery({
        queryKey: [...primeShipmentsKey(tenantId), "repeat-returners"],
        enabled: enabled && !!session && clientReady && !!tenantId,
        staleTime: 5 * 60_000,
        retry: false,
        queryFn: async () => {
            if (!tenantId) throw new Error("No active tenant");
            const { data, error } = await supabase.rpc("prime_repeat_returners", { p_tenant_id: tenantId });
            if (error) throw error;
            return z.array(rowSchema).parse(data ?? []);
        },
    });
    return { returners: query.data ?? [], isPending: query.isPending, isError: query.isError };
}
