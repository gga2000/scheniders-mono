"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";

const rowSchema = z.object({ phone: z.string(), trust: z.number().int() });

/**
 * Every customer of the active store whose Shield Trust score is under 80, as
 * phone → score, for the orders page's danger level (lib/shield/danger.ts).
 * Computed in the database for the active store only (shield_customer_trust).
 */
export function useShieldDanger() {
    const { session, clientReady, tenantId } = useAuth();
    const query = useQuery({
        queryKey: ["shield", "customer-trust", tenantId],
        enabled: !!session && clientReady && !!tenantId,
        staleTime: 5 * 60_000,
        refetchInterval: 10 * 60_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("shield_customer_trust");
            if (error) throw error;
            return z.array(rowSchema).parse(data ?? []);
        },
    });

    const trustByPhone = useMemo(
        () => new Map((query.data ?? []).map((r) => [r.phone, r.trust])) as ReadonlyMap<string, number>,
        [query.data],
    );
    return { trustByPhone, ready: query.isSuccess };
}
