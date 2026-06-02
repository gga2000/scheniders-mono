"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * Adapter against mono's `rejection_reasons` table, exposing the same shape
 * the returns cockpit expects from the original Schneiders `useOrderReasons`
 * hook. Tenant-scoping is enforced by RLS + an explicit tenant_id on writes.
 *
 * The original Schneiders app has a richer order-reasons subsystem with
 * separate "kinds" (reject / cancel / no-response). Mono currently only
 * surfaces the rejection table; other kinds return empty lists. If/when
 * the full order_reasons table is added later, this hook's public shape
 * can stay identical.
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

function rowToReason(r: RejectionReasonRow): OrderReason {
    return {
        id: r.id,
        kind: "reject" as const,
        label_ar: r.label_ar || r.label || "",
        label_en: r.label || null,
        is_active: r.is_active ?? true,
        sort_order: r.sort_order ?? 0,
    };
}

async function fetchRejectionReasons(): Promise<OrderReason[]> {
    const { data, error } = await supabase
        .from("rejection_reasons")
        .select("id, label, label_ar, sort_order, is_active")
        .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToReason);
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

/**
 * CRUD mutations for the rejection_reasons table. Currently only the
 * "reject" kind is wired through; other kinds are a no-op until the full
 * order_reasons subsystem is added.
 */
export function useOrderReasonMutations(kind: ReasonKind) {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    const key = orderReasonKeys.list(kind);
    const invalidate = () => queryClient.invalidateQueries({ queryKey: orderReasonKeys.all });

    const create = useMutation({
        mutationFn: async (input: { label_ar: string; label_en?: string | null; sort_order: number }) => {
            if (kind !== "reject") throw new Error(`Reason kind "${kind}" not yet supported in mono`);
            const { data, error } = await supabase
                .from("rejection_reasons")
                .insert([{
                    label: input.label_en || input.label_ar,
                    label_ar: input.label_ar,
                    sort_order: input.sort_order,
                    is_active: true,
                    tenant_id: tenantId,
                }])
                .select("id, label, label_ar, sort_order, is_active")
                .single();
            if (error) throw error;
            return rowToReason(data as RejectionReasonRow);
        },
        onSettled: invalidate,
    });

    const update = useMutation({
        mutationFn: async ({ id, patch }: { id: string; patch: Partial<{ label_ar: string; label_en: string | null; is_active: boolean; sort_order: number }> }) => {
            const row: Record<string, unknown> = {};
            if (patch.label_ar !== undefined) row.label_ar = patch.label_ar;
            if (patch.label_en !== undefined) row.label = patch.label_en;
            if (patch.is_active !== undefined) row.is_active = patch.is_active;
            if (patch.sort_order !== undefined) row.sort_order = patch.sort_order;
            const { error } = await supabase.from("rejection_reasons").update(row).eq("id", id);
            if (error) throw error;
        },
        onMutate: async ({ id, patch }) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<OrderReason[]>(key);
            queryClient.setQueryData<OrderReason[]>(key, (old) =>
                (old || []).map((r) => (r.id === id ? { ...r, ...patch, label_en: patch.label_en ?? r.label_en } : r)),
            );
            return { previous };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
        },
        onSettled: invalidate,
    });

    const remove = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("rejection_reasons").delete().eq("id", id);
            if (error) throw error;
        },
        onSettled: invalidate,
    });

    const reorder = useMutation({
        mutationFn: async (orderedIds: string[]) => {
            // Bump each id's sort_order to its new index. Sequential to keep
            // RLS errors visible per-row; tiny in practice (handful of rows).
            for (let i = 0; i < orderedIds.length; i++) {
                const { error } = await supabase
                    .from("rejection_reasons")
                    .update({ sort_order: i + 1 })
                    .eq("id", orderedIds[i]);
                if (error) throw error;
            }
        },
        onSettled: invalidate,
    });

    return { create, update, remove, reorder };
}
