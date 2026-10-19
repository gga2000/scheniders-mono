"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    type OrderReason,
    type ReasonKind,
    fetchOrderReasons,
    fetchReasonUsage,
    createOrderReason,
    updateOrderReason,
    deleteOrderReason,
    reorderOrderReasons,
    dedupeReasonsByLabel,
} from "@/lib/order-reasons";
import { useAuth } from "@/components/auth/auth-provider";

export const orderReasonKeys = {
    all: ["order-reasons"] as const,
    list: (kind: ReasonKind) => [...orderReasonKeys.all, kind] as const,
    usage: (kind: ReasonKind) => [...orderReasonKeys.all, "usage", kind] as const,
};

/**
 * Reasons for a kind. `enabledOnly` returns only active reasons (for the picker);
 * the editor passes false to manage disabled rows too.
 */
export function useOrderReasons(
    kind: ReasonKind,
    opts?: { enabledOnly?: boolean; enabled?: boolean },
) {
    const query = useQuery({
        queryKey: orderReasonKeys.list(kind),
        queryFn: () => fetchOrderReasons(kind),
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        enabled: opts?.enabled ?? true,
    });

    const reasons = useMemo(() => {
        const all = query.data?.reasons ?? [];
        // Picker view: active rows, and collapse same-label duplicates so a reason
        // never shows up twice. Editor view (enabledOnly=false) keeps every row.
        return opts?.enabledOnly ? dedupeReasonsByLabel(all.filter((r) => r.is_active)) : all;
    }, [query.data, opts?.enabledOnly]);

    return {
        reasons,
        isFallback: query.data?.isFallback ?? false,
        isLoading: query.isLoading,
        error: query.error,
    };
}

export function useReasonUsage(kind: ReasonKind, opts?: { enabled?: boolean }) {
    const { tenantId } = useAuth();
    const query = useQuery({
        queryKey: orderReasonKeys.usage(kind),
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchReasonUsage(tenantId, kind);
        },
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        enabled: (opts?.enabled ?? true) && !!tenantId,
    });
    return {
        usage: query.data ?? { counts: {}, total: 0 },
        isLoading: query.isLoading,
    };
}

export function useOrderReasonMutations(kind: ReasonKind) {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    const key = orderReasonKeys.list(kind);
    const invalidate = () => queryClient.invalidateQueries({ queryKey: orderReasonKeys.all });

    const create = useMutation({
        mutationFn: (input: { label_ar: string; label_en?: string | null; sort_order: number }) => {
            if (!tenantId) throw new Error("No active tenant");
            return createOrderReason({ tenant_id: tenantId, kind, ...input });
        },
        onSettled: invalidate,
    });

    const update = useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateOrderReason>[1] }) =>
            updateOrderReason(id, patch),
        onMutate: async ({ id, patch }) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData(key);
            queryClient.setQueryData(
                key,
                (old: { reasons: OrderReason[]; isFallback: boolean } | undefined) =>
                    old
                        ? {
                              ...old,
                              reasons: old.reasons.map((r) => (r.id === id ? { ...r, ...patch } : r)),
                          }
                        : old,
            );
            return { previous };
        },
        onError: (_e, _v, ctx) => {
            if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
        },
        onSettled: invalidate,
    });

    const remove = useMutation({
        mutationFn: (id: string) => deleteOrderReason(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData(key);
            queryClient.setQueryData(
                key,
                (old: { reasons: OrderReason[]; isFallback: boolean } | undefined) =>
                    old ? { ...old, reasons: old.reasons.filter((r) => r.id !== id) } : old,
            );
            return { previous };
        },
        onError: (_e, _v, ctx) => {
            if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
        },
        onSettled: invalidate,
    });

    const reorder = useMutation({
        mutationFn: (orderedIds: string[]) => reorderOrderReasons(orderedIds),
        onMutate: async (orderedIds) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData(key);
            queryClient.setQueryData(
                key,
                (old: { reasons: OrderReason[]; isFallback: boolean } | undefined) => {
                    if (!old) return old;
                    const byId = new Map(old.reasons.map((r) => [r.id, r]));
                    const reordered = orderedIds
                        .map((id, i) => {
                            const r = byId.get(id);
                            return r ? { ...r, sort_order: i + 1 } : null;
                        })
                        .filter(Boolean) as OrderReason[];
                    return { ...old, reasons: reordered };
                },
            );
            return { previous };
        },
        onError: (_e, _v, ctx) => {
            if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
        },
        onSettled: invalidate,
    });

    return { create, update, remove, reorder };
}

export type { OrderReason, ReasonKind } from "@/lib/order-reasons";
