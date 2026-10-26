"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { AbandonedCartItem } from "@scheniders/shared";
import type { RecoveryKind } from "@/lib/recovery-stats";

export interface AbandonedCartRow {
    id: string;
    phone: string;
    items: AbandonedCartItem[];
    subtotal_iqd: number;
    governorate: string | null;
    updated_at: string;
    reminded_at: string | null;
    recovered_at: string | null;
    consent_at: string | null;
    recovery_kind: RecoveryKind | null;
}

function recoveryKind(v: unknown): RecoveryKind | null {
    return v === "after_reminder" || v === "organic" ? v : null;
}

/** Captured carts for the current tenant (member RLS scopes rows). */
export function useAbandonedCarts() {
    const { tenantId } = useAuth();
    return useQuery<AbandonedCartRow[]>({
        queryKey: ["abandoned-carts", tenantId],
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return [];
            const { data, error } = await supabase
                .from("abandoned_carts")
                .select(
                    "id, phone, items, subtotal_iqd, governorate, updated_at, reminded_at, recovered_at, consent_at, recovery_kind",
                )
                .eq("tenant_id", tenantId)
                .order("updated_at", { ascending: false })
                .limit(200);
            if (error) throw error;
            const rows = (data ?? []) as unknown as Array<
                Omit<AbandonedCartRow, "items" | "recovery_kind"> & {
                    items: unknown;
                    recovery_kind: unknown;
                }
            >;
            return rows.map((r) => ({
                ...r,
                items: Array.isArray(r.items) ? (r.items as AbandonedCartItem[]) : [],
                recovery_kind: recoveryKind(r.recovery_kind),
            }));
        },
    });
}
