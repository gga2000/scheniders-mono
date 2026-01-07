"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Product, type ProductVariant, type ProductPriceHistory } from "@/lib/supabase";

// Query keys
export const productKeys = {
    all: ["products"] as const,
    lists: () => [...productKeys.all, "list"] as const,
    details: () => [...productKeys.all, "detail"] as const,
    detail: (id: string) => [...productKeys.details(), id] as const,
    variants: (productId: string) => [...productKeys.detail(productId), "variants"] as const,
};

// Fetch function
async function fetchProducts(): Promise<Product[]> {
    const { data, error } = await supabase
        .from("products")
        .select(`
            *,
            variants:product_variants(*)
        `)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
}

// Hook
export function useProductsQuery() {
    return useQuery({
        queryKey: productKeys.lists(),
        queryFn: fetchProducts,
        staleTime: 5 * 60 * 1000, // 5 minutes standard
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: true,
    });
}

// =============================================
// MUTATIONS
// =============================================

export function useAddProductMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (productData: any) => {
            // Exclude sku since the column doesn't exist in the database
            const { sku, ...data } = productData;
            const { data: newProduct, error } = await supabase
                .from("products")
                .insert([{ ...data, is_archived: false }])
                .select()
                .single();
            if (error) throw error;
            return newProduct;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        }
    });
}

export function useUpdateProductMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: any }) => {
            const { sku, ...updateData } = data;
            const { error } = await supabase
                .from("products")
                .update(updateData)
                .eq("id", id);
            if (error) throw error;
            return { id, data };
        },
        onMutate: async ({ id, data }) => {
            // Optimistic Update
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.lists());
            queryClient.setQueryData<Product[]>(productKeys.lists(), (old) =>
                old?.map((p) => (p.id === id ? { ...p, ...data } : p))
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) {
                queryClient.setQueryData(productKeys.lists(), context.previousProducts);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        }
    });
}

export function useArchiveProductMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("products").update({ is_archived: true }).eq("id", id);
            if (error) throw error;
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.lists());
            // Assuming list filters out archived, we remove it
            // Or if list shows all, we update is_archived
            queryClient.setQueryData<Product[]>(productKeys.lists(), (old) =>
                old?.map((p) => (p.id === id ? { ...p, is_archived: true } : p))
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.lists(), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useRestoreProductMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("products").update({ is_archived: false }).eq("id", id);
            if (error) throw error;
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.lists());
            queryClient.setQueryData<Product[]>(productKeys.lists(), (old) =>
                old?.map((p) => (p.id === id ? { ...p, is_archived: false } : p))
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.lists(), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useDeleteProductMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("products").delete().eq("id", id);
            if (error) throw error;
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.lists());
            queryClient.setQueryData<Product[]>(productKeys.lists(), (old) =>
                old?.filter((p) => p.id !== id)
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.lists(), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useBulkUpdatePricesMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ids, price }: { ids: string[]; price: number }) => {
            const { error } = await supabase.from("products").update({ price }).in("id", ids);
            if (error) throw error;
            return { ids, price };
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useBulkArchiveMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ids: string[]) => {
            const { error } = await supabase.from("products").update({ is_archived: true }).in("id", ids);
            if (error) throw error;
            return ids;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

// Variant Mutations
export function useAddVariantMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ productId, data }: { productId: string; data: any }) => {
            const { data: newVariant, error } = await supabase
                .from("product_variants")
                .insert([{ product_id: productId, ...data }])
                .select()
                .single();
            if (error) throw error;
            return newVariant;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useUpdateVariantMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: any }) => {
            const { error } = await supabase.from("product_variants").update(data).eq("id", id);
            if (error) throw error;
            return { id, data };
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useDeleteVariantMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("product_variants").delete().eq("id", id);
            if (error) throw error;
            return id;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function usePriceHistoryQuery(productId: string) {
    return useQuery({
        queryKey: [...productKeys.detail(productId), "history"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("product_price_history")
                .select("*")
                .eq("product_id", productId)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data || [];
        },
        enabled: !!productId,
    });
}
