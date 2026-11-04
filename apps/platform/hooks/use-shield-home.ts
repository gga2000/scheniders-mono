"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { riskyOpenOrderSchema, shieldImpactSchema } from "@/lib/shield/home";

const IMPACT_DAYS = 30;

/**
 * The home page's Shield cards: today's open orders whose customer has a bad
 * record (here or in other stores), and what Shield changed in the last 30
 * days. Both are computed in the database for the active store only.
 */
export function useShieldHome() {
    const { session, clientReady, tenantId } = useAuth();
    const enabled = !!session && clientReady && !!tenantId;

    const risky = useQuery({
        queryKey: ["shield", "home", tenantId, "risky"],
        enabled,
        staleTime: 60_000,
        refetchInterval: 5 * 60_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("shield_risky_open_orders", { p_limit: 20 });
            if (error) throw error;
            return z.array(riskyOpenOrderSchema).parse(data ?? []);
        },
    });

    const impact = useQuery({
        queryKey: ["shield", "home", tenantId, "impact", IMPACT_DAYS],
        enabled,
        staleTime: 5 * 60_000,
        queryFn: async () => {
            const to = new Date();
            const from = new Date(to.getTime() - IMPACT_DAYS * 86_400_000);
            const { data, error } = await supabase.rpc("shield_impact", { p_from: from.toISOString(), p_to: to.toISOString() });
            if (error) throw error;
            return shieldImpactSchema.parse(data?.[0] ?? { flagged_decided: 0, stopped: 0, stopped_value: 0, shipped: 0, shipped_delivered: 0, shipped_refused: 0 });
        },
    });

    return { risky, impact, impactDays: IMPACT_DAYS };
}
