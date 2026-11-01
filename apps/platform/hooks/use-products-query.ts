"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Product, type ProductVariant, type ProductPriceHistory } from "@/lib/supabase";
import { productRepository, type ProductUpdate, type VariantUpdate } from "@/lib/repositories/product-repository";
import { CACHE_PRESETS } from '@/lib/query-config';
import { useAuth } from "@/components/auth/auth-provider";
import { diag } from "@/lib/diag";
import { categoryKeys } from "@/hooks/use-categories-query";

// Query keys
export type BulkPriceChange = { id: string; oldPrice: number; clearCompareAt: boolean };

export const productKeys = {
    all: ["products"] as const,
    lists: () => [...productKeys.all, "list"] as const,
    /** One tenant's list; a member of two stores never sees the other's cache. */
    list: (tenantId: string | null) => [...productKeys.lists(), tenantId] as const,
    details: () => [...productKeys.all, "detail"] as const,
    detail: (id: string) => [...productKeys.details(), id] as const,
    variants: (productId: string) => [...productKeys.detail(productId), "variants"] as const,
};


// Hook
export function useProductsQuery() {
    const { session, clientReady, tenantId } = useAuth();
    const [fetchStartTime] = useState(() => performance.now());

    return useQuery({
        queryKey: productKeys.list(tenantId),
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
            queryKey: productKeys.list(tenantId),
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
        mutationFn: async (productData: Parameters<typeof productRepository.create>[0]) => {
            return productRepository.create(productData, tenantId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        }
    });
}

export function useUpdateProductMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ id, data, expectedUpdatedAt }: { id: string; data: ProductUpdate; expectedUpdatedAt?: string }) => {
            const updatedAt = await productRepository.update(id, data, { expectedUpdatedAt });
            return { id, data, updatedAt };
        },
        onMutate: async ({ id, data }) => {
            // Optimistic Update
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.list(tenantId));
            queryClient.setQueryData<Product[]>(productKeys.list(tenantId), (old) =>
                old?.map((p) => (p.id === id ? { ...p, ...data } : p))
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) {
                queryClient.setQueryData(productKeys.list(tenantId), context.previousProducts);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        }
    });
}

export function useArchiveProductMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (id: string) => {
            await productRepository.archive(id);
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.list(tenantId));
            // Assuming list filters out archived, we remove it
            // Or if list shows all, we update is_archived
            queryClient.setQueryData<Product[]>(productKeys.list(tenantId), (old) =>
                old?.map((p) => (p.id === id ? { ...p, is_archived: true } : p))
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.list(tenantId), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useRestoreProductMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (id: string) => {
            await productRepository.restore(id);
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.list(tenantId));
            queryClient.setQueryData<Product[]>(productKeys.list(tenantId), (old) =>
                old?.map((p) => (p.id === id ? { ...p, is_archived: false } : p))
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.list(tenantId), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useDeleteProductMutation() {
    const queryClient = useQueryClient();
    // A deleted product also leaves curated collections (product_categories).
    const invalidateAfterDelete = () =>
        Promise.all([
            queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
            queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
        ]);
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (id: string) => {
            await productRepository.delete(id);
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.list(tenantId));
            queryClient.setQueryData<Product[]>(productKeys.list(tenantId), (old) =>
                old?.filter((p) => p.id !== id)
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.list(tenantId), context.previousProducts);
        },
        onSettled: invalidateAfterDelete
    });
}

export function useBulkUpdatePricesMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ changes, price }: { changes: BulkPriceChange[]; price: number }) => {
            await productRepository.bulkChangePrice(changes, price);
            return { ids: changes.map((c) => c.id), price };
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useRestorePricesMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (previous: Parameters<typeof productRepository.restorePrices>[0]) =>
            productRepository.restorePrices(previous),
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
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
    // A deleted product also leaves curated collections (product_categories).
    const invalidateAfterDelete = () =>
        Promise.all([
            queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
            queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
        ]);
    return useMutation({
        mutationFn: async (ids: string[]) => {
            await productRepository.bulkDelete(ids);
            return ids;
        },
        onSettled: invalidateAfterDelete
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
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: ({ productId, delta, reason, notes }: AdjustStockArgs) =>
            productRepository.adjustStock({ productId, delta, reason, notes }),
        onMutate: async ({ productId, delta }) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.list(tenantId));
            queryClient.setQueryData<Product[]>(productKeys.list(tenantId), (old) =>
                old?.map((p) => (p.id === productId ? { ...p, stock_quantity: (p.stock_quantity ?? 0) + delta } : p))
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.list(tenantId), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export type StockPile = "new" | "open_box";

interface CountStockArgs {
    productId: string;
    variantId?: string | null;
    /** Which pile was counted: new units or open box. */
    pile: StockPile;
    counted: number;
    notes?: string;
}

/** One count's identity: a product can have a new and an open-box count in one save. */
export const countKey = (productId: string, pile: StockPile) => `${productId}:${pile}`;

export interface CountStockResult {
    saved: number;
    /** The counts that did not save, by countKey, and the first error. */
    failed: Map<string, unknown>;
}

/**
 * Set stock to shelf counts, one pile at a time; the database logs each
 * difference. A failure doesn't stop the rest. The catalogue is refetched
 * once at the end, not after every row.
 */
export function useSetCountedStockMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (counts: CountStockArgs[]): Promise<CountStockResult> => {
            const result: CountStockResult = { saved: 0, failed: new Map() };
            for (const args of counts) {
                try {
                    if (args.pile === "open_box") await productRepository.setCountedOpenBox(args);
                    else await productRepository.setCountedStock(args);
                    result.saved++;
                } catch (err) {
                    result.failed.set(countKey(args.productId, args.pile), err);
                }
            }
            return result;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useBulkUpdateVisibilityMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ ids, isVisible }: { ids: string[]; isVisible: boolean }) => {
            await productRepository.bulkUpdateVisibility(ids, isVisible);
            return { ids, isVisible };
        },
        onMutate: async ({ ids, isVisible }) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.list(tenantId));
            queryClient.setQueryData<Product[]>(productKeys.list(tenantId), (old) =>
                old?.map((p) => (ids.includes(p.id) ? { ...p, is_visible: isVisible } : p))
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.list(tenantId), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

export function useBulkUpdateDisplayOrderMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async (updates: { id: string; display_order: number }[]) => {
            await productRepository.bulkUpdateDisplayOrder(updates);
            return updates;
        },
        onMutate: async (updates) => {
            await queryClient.cancelQueries({ queryKey: productKeys.lists() });
            const previousProducts = queryClient.getQueryData<Product[]>(productKeys.list(tenantId));
            const updateMap = new Map(updates.map((u) => [u.id, u.display_order]));
            queryClient.setQueryData<Product[]>(productKeys.list(tenantId), (old) =>
                old?.map((p) => {
                    const newOrder = updateMap.get(p.id);
                    return newOrder !== undefined ? { ...p, display_order: newOrder } : p;
                })
            );
            return { previousProducts };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousProducts) queryClient.setQueryData(productKeys.list(tenantId), context.previousProducts);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    });
}

// Variant Mutations
export function useAddVariantMutation() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: async ({ productId, data }: { productId: string; data: Partial<ProductVariant> }) => {
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
