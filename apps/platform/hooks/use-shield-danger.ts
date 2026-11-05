"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { riskyOpenOrderSchema, riskyOrderBand } from "@/lib/shield/home";

/** The database caps shield_risky_open_orders at 100 rows. */
export const DANGER_LIMIT = 100;

/**
 * The open orders (last 14 days) whose customer's Trust score is under 80, as
 * order id → score, for the orders page's danger slider, plus how
 * many there are and how many are under 50. Computed in the database for the
 * active store only.
 */
export function useShieldDanger() {
    const { session, clientReady, tenantId } = useAuth();
    const query = useQuery({
        queryKey: ["shield", "danger", tenantId],
        enabled: !!session && clientReady && !!tenantId,
        staleTime: 60_000,
        refetchInterval: 5 * 60_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("shield_risky_open_orders", { p_limit: DANGER_LIMIT });
            if (error) throw error;
            return z.array(riskyOpenOrderSchema).parse(data ?? []);
        },
    });

    return useMemo(() => {
        const rows = query.data ?? [];
        return {
            trustById: new Map(rows.map((r) => [r.id, r.trust])) as ReadonlyMap<string, number>,
            scores: rows.map((r) => r.trust),
            count: rows.length,
            red: rows.filter((r) => riskyOrderBand(r) === "red").length,
        };
    }, [query.data]);
}
