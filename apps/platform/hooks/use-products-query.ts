"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Product, type ProductVariant, type ProductPriceHistory } from "@/lib/supabase";
import { productRepository, type ProductUpdate, type VariantUpdate } from "@/lib/repositories/product-repository";
import { CACHE_PRESETS } from '@/lib/query-config';
import { useAuth } from "@/components/auth/auth-provider";
import { diag } from "@/lib/diag";

// Query keys
export const productKeys = {
    all: ["products"] as const,
    lists: () => [...productKeys.all, "list"] as const,
    details: () => [...productKeys.all, "detail"] as const,
    detail: (id: string) => [...productKeys.details(), id] as const,
    variants: (productId: string) => [...productKeys.detail(productId), "variants"] as const,
};


// Hook
export function useProductsQuery() {
    const { session, clientReady, tenantId } = useAuth();
    const [fetchStartTime] = useState(() => performance.now());

    return useQuery({
        queryKey: productKeys.lists(),
        queryFn: async () => {
            const hasSession = !!session;
            const elapsed = performance.now() - fetchStartTime;
            diag.log(`[Diag:Products] FETCH_START hasSession=${hasSession} clientReady=${clientReady} elapsedSinceMount=${elapsed.toFixed(1)}ms`);

            if (!tenantId) return [];
            const result = await productRepository.findAll(tenantId);

            const fetchMs = performance.now() - fetchStartTime;
            diag.log(`[Diag:Products] FETCH_DONE count=${result.length} fetchMs=${fetchMs.toFixed(1)}ms hasSession=${!!session}`);

            return result;
        },
        // CRITICAL: Wait for Supabase client's internal session to be ready
        // Not just React state - the client must have completed _initialize()
        enabled: !!session && clientReady && !!tenantId,
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
    const { tenantId } = useAuth();
    return () => {
        if (!tenantId) return;
        queryClient.prefetchQuery({
            queryKey: productKeys.lists(),
            queryFn: () => productRepository.findAll(tenantId),
            staleTime: CACHE_PRESETS.STANDARD.staleTime,
        });
    };
}

// =============================================
// MUTATIONS
// =============================================

export function useAddProductMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (productData: any) => {
            return productRepository.create(productData, tenantId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        }
    });
}

export function useUpdateProductMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: ProductUpdate }) => {
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

export function useBulkRestoreMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ids: string[]) => {
            await productRepository.bulkRestore(ids);
            return ids;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useBulkDeleteMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ids: string[]) => {
            await productRepository.bulkDelete(ids);
            return ids;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useRecomputeInventoryMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async () => {
            await productRepository.recomputeInventory(tenantId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        },
    });
}

interface AdjustStockArgs {
    productId: string;
    /** Units to add (positive) or remove (negative). */
    delta: number;
    reason: string;
    notes?: string;
}

/** Add or remove units; applied by the database to the current stock. */
export function useAdjustStockMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ productId, delta, reason, notes }: AdjustStockArgs) =>
            productRepository.adjustStock({ productId, delta, reason, notes }),
        onMutate: async ({ productId, delta }) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.lists());
            queryClient.setQueryData<Product[]>(productKeys.lists(), (old) =>
                old?.map((p) => (p.id === productId ? { ...p, stock_quantity: (p.stock_quantity ?? 0) + delta } : p))
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.lists(), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

interface CountStockArgs {
    productId: string;
    variantId?: string | null;
    counted: number;
    notes?: string;
}

/** Set stock to a shelf count; the database logs the difference. */
export function useSetCountedStockMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (args: CountStockArgs) => productRepository.setCountedStock(args),
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useBulkUpdateVisibilityMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ids, isVisible }: { ids: string[]; isVisible: boolean }) => {
            await productRepository.bulkUpdateVisibility(ids, isVisible);
            return { ids, isVisible };
        },
        onMutate: async ({ ids, isVisible }) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.lists());
            queryClient.setQueryData<Product[]>(productKeys.lists(), (old) =>
                old?.map((p) => (ids.includes(p.id) ? { ...p, is_visible: isVisible } : p))
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.lists(), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useBulkUpdateDisplayOrderMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (updates: { id: string; display_order: number }[]) => {
            await productRepository.bulkUpdateDisplayOrder(updates);
            return updates;
        },
        onMutate: async (updates) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.lists());
            const updateMap = new Map(updates.map((u) => [u.id, u.display_order]));
            queryClient.setQueryData<Product[]>(productKeys.lists(), (old) =>
                old?.map((p) => {
                    const newOrder = updateMap.get(p.id);
                    return newOrder !== undefined ? { ...p, display_order: newOrder } : p;
                })
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.lists(), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

// Variant Mutations
export function useAddVariantMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ productId, data }: { productId: string; data: any }) => {
            return productRepository.addVariant(productId, data, tenantId);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useUpdateVariantMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: VariantUpdate }) => {
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
