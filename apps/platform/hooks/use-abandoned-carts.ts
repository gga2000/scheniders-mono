"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { AbandonedCartItem } from "@scheniders/shared";

export interface AbandonedCartRow {
    id: string;
    phone: string;
    items: AbandonedCartItem[];
    subtotal_iqd: number;
    governorate: string | null;
    updated_at: string;
    reminded_at: string | null;
    recovered_at: string | null;
}

/** Captured carts for the current tenant (member RLS scopes rows). */
export function useAbandonedCarts() {
    const { tenantId } = useAuth();
    return useQuery<AbandonedCartRow[]>({
        queryKey: ["abandoned-carts", tenantId],
        enabled: !!tenantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("abandoned_carts")
                .select(
                    "id, phone, items, subtotal_iqd, governorate, updated_at, reminded_at, recovered_at",
                )
                .eq("tenant_id", tenantId!)
                .order("updated_at", { ascending: false })
                .limit(200);
            if (error) throw error;
            const rows = (data ?? []) as unknown as Array<
                Omit<AbandonedCartRow, "items"> & { items: unknown }
            >;
            return rows.map((r) => ({
                ...r,
                items: Array.isArray(r.items) ? (r.items as AbandonedCartItem[]) : [],
            }));
        },
    });
}
