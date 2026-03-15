"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Product, type ProductVariant, type ProductPriceHistory } from "@/lib/supabase";
import { productRepository } from "@/lib/repositories/product-repository";
import { CACHE_PRESETS } from '@/lib/query-config';
import { useAuth } from "@/components/auth/auth-provider";

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
    return productRepository.findAll();
}

// Hook
export function useProductsQuery() {
    const { session } = useAuth();
    const [fetchStartTime] = useState(() => performance.now());

    return useQuery({
        queryKey: productKeys.lists(),
        queryFn: async () => {
            const hasSession = !!session;
            const elapsed = performance.now() - fetchStartTime;
            console.log(`[Diag:Products] FETCH_START hasSession=${hasSession} elapsedSinceMount=${elapsed.toFixed(1)}ms`);

            const result = await fetchProducts();

            const fetchMs = performance.now() - fetchStartTime;
            console.log(`[Diag:Products] FETCH_DONE count=${result.length} fetchMs=${fetchMs.toFixed(1)}ms hasSession=${!!session}`);

            return result;
        },
        enabled: !!session, // CRITICAL FIX: Don't fetch until session is ready
        staleTime: CACHE_PRESETS.STANDARD.staleTime * 2, // 10 mins
        gcTime: CACHE_PRESETS.STANDARD.gcTime * 2, // 30 mins
        refetchOnWindowFocus: true,
        // Network Optimization: Exponential backoff for 3G drops
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });
}

/**
 * Prefetch products for instant navigation
 */
export function usePrefetchProducts() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.prefetchQuery({
            queryKey: productKeys.lists(),
            queryFn: fetchProducts,
            staleTime: CACHE_PRESETS.STANDARD.staleTime,
        });
    };
}

// =============================================
// MUTATIONS
// =============================================

export function useAddProductMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (productData: any) => {
            return productRepository.create(productData);
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
            await productRepository.update(id, data);
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
            await productRepository.archive(id);
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
            await productRepository.restore(id);
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
            await productRepository.delete(id);
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
            await productRepository.bulkUpdatePrice(ids, price);
            return { ids, price };
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useBulkArchiveMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ids: string[]) => {
            await productRepository.bulkArchive(ids);
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
            return productRepository.addVariant(productId, data);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useUpdateVariantMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: any }) => {
            await productRepository.updateVariant(id, data);
            return { id, data };
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useDeleteVariantMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await productRepository.deleteVariant(id);
            return id;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function usePriceHistoryQuery(productId: string) {
    return useQuery({
        queryKey: [...productKeys.detail(productId), "history"],
        queryFn: async () => {
            return productRepository.getPriceHistory(productId);
        },
        enabled: !!productId,
    });
}
