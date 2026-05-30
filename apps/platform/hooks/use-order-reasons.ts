"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Adapter against mono's `rejection_reasons` table, exposing the same shape
 * the returns cockpit expects from the original Schneiders `useOrderReasons`
 * hook. Tenant-scoping is enforced by RLS on the underlying table.
 *
 * The original Schneiders app has a richer order-reasons subsystem with
 * separate "kinds" (reject / cancel / no-response). Mono currently only has
 * the rejection table; other kinds return empty lists. If/when the full
 * order_reasons table is ported, replace the body of this hook — its public
 * shape can stay the same.
 */

export type ReasonKind = "reject" | "cancel" | "no_response";

export interface OrderReason {
    id: string;
    kind: ReasonKind;
    label_ar: string;
    label_en?: string | null;
    is_active: boolean;
    sort_order: number;
}

interface RejectionReasonRow {
    id: string;
    label: string | null;
    label_ar: string | null;
    sort_order: number | null;
    is_active: boolean | null;
}

async function fetchRejectionReasons(): Promise<OrderReason[]> {
    const { data, error } = await supabase
        .from("rejection_reasons")
        .select("id, label, label_ar, sort_order, is_active")
        .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data || []).map((r: RejectionReasonRow) => ({
        id: r.id,
        kind: "reject" as const,
        label_ar: r.label_ar || r.label || "",
        label_en: r.label || null,
        is_active: r.is_active ?? true,
        sort_order: r.sort_order ?? 0,
    }));
}

export const orderReasonKeys = {
    all: ["order-reasons"] as const,
    list: (kind: ReasonKind) => [...orderReasonKeys.all, kind] as const,
};

/**
 * Reasons for a kind. `enabledOnly` returns only active reasons (for the
 * picker); pass `false` to manage disabled rows too.
 */
export function useOrderReasons(
    kind: ReasonKind,
    opts?: { enabledOnly?: boolean; enabled?: boolean }
) {
    const query = useQuery({
        queryKey: orderReasonKeys.list(kind),
        queryFn: () => (kind === "reject" ? fetchRejectionReasons() : Promise.resolve([])),
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        enabled: opts?.enabled ?? true,
    });

    const reasons = useMemo(() => {
        const all = query.data ?? [];
        return opts?.enabledOnly ? all.filter((r) => r.is_active) : all;
    }, [query.data, opts?.enabledOnly]);

    return {
        reasons,
        isLoading: query.isLoading,
        error: query.error,
    };
}
