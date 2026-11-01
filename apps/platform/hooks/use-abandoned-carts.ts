"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/fetch-all-pages";
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
            // Recovery stats are totals over every captured cart, so read them all.
            const data = await fetchAllPages<Record<string, unknown>>(async (offset) => {
                const { data: page, error, count } = await supabase
                    .from("abandoned_carts")
                    .select(
                        "id, phone, items, subtotal_iqd, governorate, updated_at, reminded_at, recovered_at, consent_at, recovery_kind",
                        { count: "exact" },
                    )
                    .eq("tenant_id", tenantId)
                    .order("updated_at", { ascending: false })
                    .order("id", { ascending: false })
                    .range(offset, offset + 999);
                if (error) throw error;
                return { rows: (page ?? []) as Record<string, unknown>[], total: count ?? 0 };
            });
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
