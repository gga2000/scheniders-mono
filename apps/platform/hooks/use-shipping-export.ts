"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { parseSavedLayouts, type ExportLayout, type SavedLayout } from "@/lib/shipping/export-columns";

/**
 * Fermi B4: the store's saved courier layouts ("my courier"), and which of a
 * set of orders already went to a courier. Both are read as the signed-in
 * merchant, so RLS keeps them to the merchant's own store. Neither is behind
 * the billing lock: shipping stays open on a locked store (A1).
 */

const layoutsKey = (tenantId: string | null) => ["shipping_export_layouts", tenantId] as const;

export function useSavedLayouts(enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery<SavedLayout[]>({
        queryKey: layoutsKey(tenantId),
        enabled: enabled && !!tenantId,
        staleTime: 60_000,
        queryFn: async () => {
            if (!tenantId) return [];
            const { data, error } = await supabase
                .from("shipping_export_templates")
                .select("id, name, columns, phone_format, file_format")
                .eq("tenant_id", tenantId)
                .order("updated_at", { ascending: false });
            if (error) throw error;
            return parseSavedLayouts(data ?? []);
        },
    });
}

/**
 * Save a layout: with `id`, that saved layout is changed (renamed too); without,
 * a new one is added. Names are unique per store in any case, so a name already
 * taken is refused by the database; `layoutNameTaken` lets the window say so first.
 */
export function useSaveLayout() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, name, layout }: { id?: string; name: string; layout: ExportLayout }): Promise<SavedLayout> => {
            if (!tenantId) throw new Error("No active store");
            const row = {
                tenant_id: tenantId,
                name: name.trim(),
                columns: layout.columns.map((c) => ({ key: c.key, header: c.header.trim() })),
                phone_format: layout.phoneFormat,
                file_format: layout.fileFormat,
            };
            const query = id
                ? supabase.from("shipping_export_templates").update(row).eq("id", id).eq("tenant_id", tenantId)
                : supabase.from("shipping_export_templates").insert(row);
            const { data, error } = await query.select("id, name, columns, phone_format, file_format").single();
            if (error) throw error;
            const [saved] = parseSavedLayouts([data]);
            if (!saved) throw new Error("The saved layout could not be read back");
            return saved;
        },
        onSuccess: (saved) => {
            // In the list at once, so the window can select it before the refetch lands.
            queryClient.setQueryData<SavedLayout[]>(layoutsKey(tenantId), (prev = []) => [
                saved,
                ...prev.filter((l) => l.id !== saved.id),
            ]);
            return queryClient.invalidateQueries({ queryKey: layoutsKey(tenantId) });
        },
    });
}

export function useDeleteLayout() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            if (!tenantId) throw new Error("No active store");
            const { error } = await supabase
                .from("shipping_export_templates")
                .delete()
                .eq("id", id)
                .eq("tenant_id", tenantId);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: layoutsKey(tenantId) }),
    });
}

const historyRowSchema = z.object({
    order_id: z.string(),
    sent_at: z.string().nullable(),
    courier: z.string().nullable(),
});

export type SentBefore = { sentAt: string | null; courier: string | null };

/**
 * The orders in `orderIds` that already went to a courier: in an export file,
 * or to Prime by API. Keyed by order id.
 */
export function useSentBefore(orderIds: readonly string[], enabled: boolean) {
    const { tenantId } = useAuth();
    const sorted = [...orderIds].sort();
    return useQuery<Map<string, SentBefore>>({
        queryKey: ["shipping_export_history", tenantId, sorted],
        enabled: enabled && !!tenantId && sorted.length > 0,
        staleTime: 15_000,
        queryFn: async () => {
            if (!tenantId) return new Map();
            const { data, error } = await supabase.rpc("shipping_export_history", {
                p_tenant_id: tenantId,
                p_order_ids: sorted,
            });
            if (error) throw error;
            const rows = z.array(historyRowSchema).parse(data ?? []);
            return new Map(rows.map((r) => [r.order_id, { sentAt: r.sent_at, courier: r.courier }]));
        },
    });
}
