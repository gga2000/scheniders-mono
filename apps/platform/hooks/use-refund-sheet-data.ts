"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { Order } from "@/types/order";
import { loadAfterSaleState, type AfterSaleState } from "@/lib/after-sale/state";

export const refundSheetKeys = {
    forOrder: (tenantId: string | null, orderId: string | undefined) => ["refund-sheet", tenantId, orderId] as const,
};

/** What the refund and replace sheets need for one original order (see loadAfterSaleState). */
export function useRefundSheetData(order: Pick<Order, "id" | "items" | "price"> | null, enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: refundSheetKeys.forOrder(tenantId, order?.id),
        enabled: enabled && !!tenantId && !!order,
        staleTime: 0,
        queryFn: async (): Promise<AfterSaleState> => {
            if (!tenantId || !order) throw new Error("No active tenant");
            return loadAfterSaleState(supabase, tenantId, order);
        },
    });
}
