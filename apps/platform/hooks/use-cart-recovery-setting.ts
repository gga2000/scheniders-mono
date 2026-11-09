"use client";

import { useQuery } from "@tanstack/react-query";
import { resolveCartRecovery } from "@scheniders/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * The published automatic-reminder setting (store editor › Cart recovery),
 * resolved the same way the sending cron reads it, so the page says exactly
 * what the cron will do.
 */
export function useCartRecoverySetting() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["cart-recovery-setting", tenantId],
        enabled: !!tenantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenants")
                .select("store_config_v2")
                .eq("id", tenantId as string)
                .single();
            if (error) throw error;
            const cfg = data?.store_config_v2 as { commerce?: { cart_recovery?: Parameters<typeof resolveCartRecovery>[0] } } | null;
            return resolveCartRecovery(cfg?.commerce?.cart_recovery);
        },
    });
}
