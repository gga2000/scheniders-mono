"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * Shared current-tenant query.
 *
 * Several always-mounted chrome components (trial banner, paused banner,
 * merchant-code badge) each used to fetch the tenant row independently — 3
 * identical round-trips on every load, adding to the boot request stampede.
 * This consolidates them into ONE cached query (superset of columns, single
 * key), so they all share a single fetch.
 */
export interface TenantSummary {
    id: string;
    status: string;
    trial_ends_at: string | null;
    plan: string | null;
    restrictions: {
        paused_until?: string | null;
        paused_at?: string | null;
        reason?: string | null;
        blocks?: Record<string, boolean>;
    } | null;
    display_id: number | null;
}

export function useTenant() {
    const { tenantId } = useAuth();
    return useQuery<TenantSummary | null>({
        queryKey: ["tenant", tenantId],
        enabled: !!tenantId,
        // Status/restrictions change occasionally; refetch on focus so a pause or
        // trial change reflects promptly. display_id is effectively static.
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenants")
                .select("id, status, trial_ends_at, plan, restrictions, display_id")
                .eq("id", tenantId!)
                .maybeSingle();
            if (error) throw error;
            return data as TenantSummary | null;
        },
    });
}
