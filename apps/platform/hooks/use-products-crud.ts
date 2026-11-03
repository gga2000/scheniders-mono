"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Product, ProductVariant } from "@/lib/supabase";
import { useProductSalesQuery } from "@/hooks/use-product-sales-query";
import type { BulkPriceChange } from "@/hooks/use-products-query";
import type { NewProduct, ProductUpdate } from "@/lib/repositories/product-repository";
import {
    useProductsQuery,
    useAddProductMutation,
    useUpdateProductMutation,
    useArchiveProductMutation,
    useRestoreProductMutation,
    useDeleteProductMutation,
    useBulkUpdatePricesMutation,
    useRestorePricesMutation,
    useBulkArchiveMutation,
    useBulkRestoreMutation,
    useBulkDeleteMutation,
    useBulkUpdateVisibilityMutation,
    useBulkUpdateDisplayOrderMutation,
    useAddVariantMutation,
    useUpdateVariantMutation,
    useDeleteVariantMutation,
} from "@/hooks/use-products-query";

interface VariantFormData {
    name: string;
    price?: number;
    cost?: number;
    stock_quantity: number;
    sku?: string;
    option_values?: Record<string, string>;
    image_url?: string;
    is_enabled?: boolean;
}

interface UseProductsCrudOptions {
    /**
     * Fold in per-product sales (`times_sold`, revenue…). Only screens that
     * show them ask: the sales RPC scans every delivered order line, so the
     * orders, finances and analytics pages, which only need the catalogue,
     * don't pay for it.
     */
    withSales?: boolean;
}

/**
 * Products plus their mutations. Every mutation rejects when the write fails
 * (RLS denial, paused tenant, network): callers report the failure, and never
 * claim success for a write that didn't happen.
 */
export function useProductsCrud({ withSales = false }: UseProductsCrudOptions = {}) {
    const queryClient = useQueryClient();
    const { data: rawProducts, isLoading: loading, isPending: pending, error: queryError } = useProductsQuery();
    const { sales: salesByProductId, unavailable: salesUnavailable, retry: retrySales } = useProductSalesQuery(withSales);

    // Mutations
    const addProductMutation = useAddProductMutation();
    const updateProductMutation = useUpdateProductMutation();
    const archiveProductMutation = useArchiveProductMutation();
    const restoreProductMutation = useRestoreProductMutation();
    const deleteProductMutation = useDeleteProductMutation();
    const bulkUpdatePricesMutation = useBulkUpdatePricesMutation();
    const restorePricesMutation = useRestorePricesMutation();
    const bulkArchiveMutation = useBulkArchiveMutation();
    const bulkRestoreMutation = useBulkRestoreMutation();
    const bulkDeleteMutation = useBulkDeleteMutation();
    const bulkUpdateVisibilityMutation = useBulkUpdateVisibilityMutation();
    const bulkUpdateDisplayOrderMutation = useBulkUpdateDisplayOrderMutation();
    const addVariantMutation = useAddVariantMutation();
    const updateVariantMutation = useUpdateVariantMutation();
    const deleteVariantMutation = useDeleteVariantMutation();

    // Enrich products with sales data
    const products = useMemo(() => {
        return (rawProducts || []).map((product) => {
            const salesData = salesByProductId.get(product.id)
                ?? { timesSold: 0, totalRevenue: 0, averageOrderValue: 0, timesSold30d: 0, revenue30d: 0 };
            const profitMargin = product.cost && product.price > 0
                ? ((product.price - product.cost) / product.price) * 100
                : undefined;

            return {
                ...product,
                times_sold: salesData.timesSold,
                total_revenue: salesData.totalRevenue,
                average_order_value: salesData.averageOrderValue,
                times_sold_30d: salesData.timesSold30d,
                revenue_30d: salesData.revenue30d,
                profit_margin: profitMargin,
            };
        });
    }, [rawProducts, salesByProductId]);

    // =============================================
    // CRUD Operations Wrappers
    // =============================================

    const addProduct = (data: NewProduct): Promise<Product> =>
        addProductMutation.mutateAsync(data);

    /** Resolves to the product's new updated_at (see productRepository.update). */
    const updateProduct = async (
        id: string,
        data: ProductUpdate,
        opts: { expectedUpdatedAt?: string; refresh?: boolean } = {},
    ): Promise<string | null> => {
        const { updatedAt } = await updateProductMutation.mutateAsync({ id, data, expectedUpdatedAt: opts.expectedUpdatedAt, refresh: opts.refresh });
        return updatedAt;
    };

    const archiveProduct = async (id: string): Promise<void> => {
        await archiveProductMutation.mutateAsync(id);
    };

    const restoreProduct = async (id: string): Promise<void> => {
        await restoreProductMutation.mutateAsync(id);
    };

    const deleteProduct = async (id: string): Promise<void> => {
        await deleteProductMutation.mutateAsync(id);
    };

    const restorePrices = async (
        previous: Parameters<typeof restorePricesMutation.mutateAsync>[0],
    ): Promise<void> => {
        await restorePricesMutation.mutateAsync(previous);
    };

    const bulkUpdatePrices = async (changes: BulkPriceChange[], newPrice: number): Promise<void> => {
        await bulkUpdatePricesMutation.mutateAsync({ changes, price: newPrice });
    };

    const bulkArchive = async (productIds: string[]): Promise<void> => {
        await bulkArchiveMutation.mutateAsync(productIds);
    };

    const bulkRestore = async (productIds: string[]): Promise<void> => {
        await bulkRestoreMutation.mutateAsync(productIds);
    };

    const bulkDelete = async (productIds: string[]): Promise<void> => {
        await bulkDeleteMutation.mutateAsync(productIds);
    };

    const bulkUpdateVisibility = async (productIds: string[], isVisible: boolean): Promise<void> => {
        await bulkUpdateVisibilityMutation.mutateAsync({ ids: productIds, isVisible });
    };

    // =============================================
    // Variant Operations Wrappers
    // =============================================

    // { refresh: false } skips re-reading the product row after this write; the
    // caller saving several variants re-reads it once at the end.
    type VariantWriteOptions = { refresh?: boolean };

    const addVariant = (productId: string, data: VariantFormData, opts?: VariantWriteOptions): Promise<ProductVariant> =>
        addVariantMutation.mutateAsync({ productId, data, refresh: opts?.refresh });

    const updateVariant = async (
        productId: string,
        variantId: string,
        data: Omit<Partial<VariantFormData>, "stock_quantity">,
        opts?: VariantWriteOptions,
    ): Promise<void> => {
        await updateVariantMutation.mutateAsync({ productId, id: variantId, data, refresh: opts?.refresh });
    };

    const deleteVariant = async (productId: string, variantId: string, opts?: VariantWriteOptions): Promise<void> => {
        await deleteVariantMutation.mutateAsync({ productId, id: variantId, refresh: opts?.refresh });
    };

    const reorderProducts = async (updates: { id: string; display_order: number }[]): Promise<void> => {
        await bulkUpdateDisplayOrderMutation.mutateAsync(updates);
    };

    return {
        products: products || [],
        loading,
        /** True until the first result, including while the query waits for the session. */
        pending,
        /** Sales failed to load: the 0 sold / 0 revenue on products are placeholders, not facts. */
        salesUnavailable,
        retrySales,
        error: queryError ? (queryError instanceof Error ? queryError.message : "Error fetching products") : null,
        // CRUD operations
        addProduct,
        updateProduct,
        archiveProduct,
        restoreProduct,
        deleteProduct,
        // Bulk operations
        bulkUpdatePrices,
        restorePrices,
        bulkArchive,
        bulkRestore,
        bulkDelete,
        bulkUpdateVisibility,
        reorderProducts,
        // Variant operations
        addVariant,
        updateVariant,
        deleteVariant,
        refetch: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); },
    };
}
