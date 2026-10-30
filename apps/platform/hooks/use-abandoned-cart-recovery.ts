"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { parseRecovery, type AbandonedCartRecovery } from "@/lib/orders/abandoned-cart-recovery";

export const RECOVERY_WINDOW_DAYS = 30;

/**
 * How the tenant's abandoned carts ended over the last 30 days: still open,
 * taken by staff, came back on their own, or auto-removed. Tenant-scoped on
 * the server (membership guard in the RPC), so the explicit id here only
 * picks which of the caller's tenants.
 */
export function useAbandonedCartRecovery() {
    const { tenantId } = useAuth();
    return useQuery<AbandonedCartRecovery>({
        queryKey: ["abandoned-cart-recovery", tenantId, RECOVERY_WINDOW_DAYS],
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return parseRecovery({});
            const { data, error } = await supabase.rpc("get_abandoned_cart_recovery", {
                _tenant_id: tenantId,
                _days: RECOVERY_WINDOW_DAYS,
            });
            if (error) throw error;
            return parseRecovery(data);
        },
        staleTime: 60 * 1000,
    });
}
