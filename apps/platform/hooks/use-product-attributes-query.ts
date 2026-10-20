"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { parseProductAttributeDefs, type ProductAttributeDef } from "@scheniders/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";

export const attributeKeys = {
    all: ["product-attributes"] as const,
    defs: (tenantId: string | null) => [...attributeKeys.all, "defs", tenantId] as const,
    usage: () => [...attributeKeys.all, "usage"] as const,
};

/** Columns the editor needs — the same set the storefront reads. */
const DEF_COLUMNS =
    "id, key, name_i18n, kind, options, group_keys, range_min, range_max, unit_i18n, is_filterable, is_comparable, display_order";

/**
 * A definition as the editor writes it. Distinct from `ProductAttributeDef`
 * (the parsed, kind-narrowed read shape) because a write only carries the
 * fields its kind requires — sending `options` on a range row would be
 * meaningless, and the database CHECK is what decides whether the row is
 * well-formed.
 */
export interface AttributeDefWrite {
    key: string;
    name_i18n: Record<string, string>;
    kind: ProductAttributeDef["kind"];
    options?: { value: string; label_i18n: Record<string, string> }[] | null;
    group_keys?: { key: string; label_i18n: Record<string, string> }[] | null;
    range_min?: number | null;
    range_max?: number | null;
    unit_i18n?: Record<string, string> | null;
    is_filterable: boolean;
    is_comparable: boolean;
    display_order: number;
}

/**
 * One store's attribute definitions. Filtered on the tenant explicitly:
 * `public_storefront_read` lets any signed-in user read every active store's
 * definitions, so RLS alone would mix other stores' attributes into this list.
 */
export async function fetchAttributeDefs(tenantId: string): Promise<ProductAttributeDef[]> {
    const { data, error } = await supabase
        .from("product_attribute_defs")
        .select(DEF_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("display_order", { ascending: true });
    if (error) throw error;
    return parseProductAttributeDefs(data ?? []);
}

/**
 * How many products carry a value for each attribute. Shown next to each
 * row so the merchant can see what a deletion would actually remove —
 * `ON DELETE CASCADE` takes the values with the definition.
 */
async function fetchAttributeUsage(): Promise<Record<string, number>> {
    const { data, error } = await supabase
        .from("product_attribute_values")
        .select("attribute_def_id");
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
        counts[row.attribute_def_id] = (counts[row.attribute_def_id] ?? 0) + 1;
    }
    return counts;
}

export function useAttributeDefsQuery() {
    const { session, clientReady, tenantId } = useAuth();
    return useQuery({
        queryKey: attributeKeys.defs(tenantId),
        queryFn: () => {
            if (!tenantId) throw new Error("attribute definitions requested without a tenant");
            return fetchAttributeDefs(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
    });
}

export function useAttributeUsageQuery() {
    const { session, clientReady } = useAuth();
    return useQuery({
        queryKey: attributeKeys.usage(),
        queryFn: fetchAttributeUsage,
        enabled: !!session && clientReady,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
    });
}

function useInvalidateAttributes() {
    const queryClient = useQueryClient();
    return () => {
        void queryClient.invalidateQueries({ queryKey: attributeKeys.all });
    };
}

export function useAddAttributeDefMutation() {
    const { tenantId } = useAuth();
    const invalidate = useInvalidateAttributes();
    return useMutation({
        mutationFn: async (input: AttributeDefWrite) => {
            if (!tenantId) throw new Error("No tenant in session");
            const { data, error } = await supabase
                .from("product_attribute_defs")
                .insert([{ ...input, tenant_id: tenantId } as never])
                .select(DEF_COLUMNS)
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: invalidate,
    });
}

export function useUpdateAttributeDefMutation() {
    const invalidate = useInvalidateAttributes();
    return useMutation({
        mutationFn: async ({ id, ...input }: AttributeDefWrite & { id: string }) => {
            const { data, error } = await supabase
                .from("product_attribute_defs")
                .update(input as never)
                .eq("id", id)
                .select(DEF_COLUMNS)
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: invalidate,
    });
}

export function useDeleteAttributeDefMutation() {
    const invalidate = useInvalidateAttributes();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("product_attribute_defs")
                .delete()
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: invalidate,
    });
}
