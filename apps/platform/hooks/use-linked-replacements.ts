"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { Order } from "@/types/order";

export type LinkedReplacementOrder = Pick<Order, "id" | "order_id" | "status" | "price" | "delivery_fee" | "created_at">;

/**
 * The orders on the other side of a replacement link: for a replacement, the
 * order it replaces; for any other order, its replacements, newest first.
 */
export function useLinkedReplacements(order: Pick<Order, "id" | "is_replacement" | "is_return" | "original_order_id"> | null) {
    const { tenantId } = useAuth();
    const parentId = order?.is_replacement ? order.original_order_id ?? null : null;

    return useQuery({
        queryKey: ["linked-after-sale", "replacements", tenantId, order?.id, parentId],
        enabled: !!tenantId && !!order && !order.is_return && (!order.is_replacement || !!parentId),
        staleTime: 30 * 1000,
        queryFn: async (): Promise<LinkedReplacementOrder[]> => {
            if (!tenantId || !order) return [];
            const base = supabase
                .from("orders")
                .select("id, order_id, status, price, delivery_fee, created_at")
                .eq("tenant_id", tenantId)
                .is("deleted_at", null);
            const { data, error } = await (parentId
                ? base.eq("id", parentId)
                : base.eq("original_order_id", order.id).eq("is_replacement", true).order("created_at", { ascending: false }));
            if (error) throw error;
            return (data ?? []) as LinkedReplacementOrder[];
        },
    });
}
