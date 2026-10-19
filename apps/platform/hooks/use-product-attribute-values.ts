"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import { attributeKeys } from "./use-product-attributes-query";

export const attributeValueKeys = {
    all: ["product-attribute-values"] as const,
    forProduct: (productId: string) => [...attributeValueKeys.all, productId] as const,
};

export interface AttributeValueRow {
    attribute_def_id: string;
    value: unknown;
}

async function fetchValues(productId: string): Promise<AttributeValueRow[]> {
    const { data, error } = await supabase
        .from("product_attribute_values")
        .select("attribute_def_id, value")
        .eq("product_id", productId);
    if (error) throw error;
    return data ?? [];
}

export function useProductAttributeValuesQuery(productId: string | undefined) {
    const { session, clientReady } = useAuth();
    return useQuery({
        queryKey: attributeValueKeys.forProduct(productId ?? ""),
        queryFn: () => fetchValues(productId!),
        enabled: !!productId && !!session && clientReady,
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
    });
}

/**
 * Write one product/attribute pair. `tenant_id` is sent because the column
 * is NOT NULL, but it is not trusted: a BEFORE trigger overwrites it from
 * the product's own tenant and refuses the row if the definition belongs to
 * a different tenant.
 */
export function useSetProductAttributeValue(productId: string | undefined) {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ defId, value }: { defId: string; value: unknown }) => {
            if (!productId) throw new Error("No product");
            if (!tenantId) throw new Error("No tenant in session");
            const { error } = await supabase
                .from("product_attribute_values")
                .upsert(
                    [{ product_id: productId, attribute_def_id: defId, tenant_id: tenantId, value } as never],
                    { onConflict: "product_id,attribute_def_id" },
                );
            if (error) throw error;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: attributeValueKeys.forProduct(productId ?? "") });
            // The taxonomy tab shows a per-attribute usage count.
            void queryClient.invalidateQueries({ queryKey: attributeKeys.usage() });
        },
    });
}

export function useClearProductAttributeValue(productId: string | undefined) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (defId: string) => {
            if (!productId) throw new Error("No product");
            const { error } = await supabase
                .from("product_attribute_values")
                .delete()
                .eq("product_id", productId)
                .eq("attribute_def_id", defId);
            if (error) throw error;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: attributeValueKeys.forProduct(productId ?? "") });
            void queryClient.invalidateQueries({ queryKey: attributeKeys.usage() });
        },
    });
}
