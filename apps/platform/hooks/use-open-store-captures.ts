"use client";

import { useQuery } from "@tanstack/react-query";
import type { AbandonedCartItem } from "@scheniders/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

export interface StoreCaptureRow {
    id: string;
    phone: string;
    items: AbandonedCartItem[];
    subtotal_iqd: number;
    governorate: string | null;
    updated_at: string;
    /** Set when the buyer typed the phone with the consent line shown. */
    consent_at: string | null;
    reminded_at: string | null;
}

/** The worklist shows the newest open captures; the full history is on
 *  /store/recovery. */
export const OPEN_CAPTURES_LIMIT = 100;

/**
 * Open store captures for the active tenant: phones typed on the store's
 * order form with no order from that phone since. Newest first.
 *
 * It is tenant-scoped twice: by the explicit filter here, and by the
 * member-SELECT RLS policy on abandoned_carts underneath it. It is
 * read-only, because writes to abandoned_carts are service-role only.
 */
export function useOpenStoreCaptures() {
    const { tenantId } = useAuth();
    return useQuery<StoreCaptureRow[]>({
        queryKey: ["store-captures-open", tenantId],
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return [];
            const { data, error } = await supabase
                .from("abandoned_carts")
                .select(
                    "id, phone, items, subtotal_iqd, governorate, updated_at, consent_at, reminded_at",
                )
                .eq("tenant_id", tenantId)
                .is("recovered_at", null)
                .order("updated_at", { ascending: false })
                .limit(OPEN_CAPTURES_LIMIT);
            if (error) throw error;
            const rows = (data ?? []) as unknown as Array<
                Omit<StoreCaptureRow, "items"> & { items: unknown }
            >;
            return rows.map((r) => ({
                ...r,
                items: Array.isArray(r.items) ? (r.items as AbandonedCartItem[]) : [],
            }));
        },
    });
}
