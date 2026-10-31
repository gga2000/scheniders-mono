"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Product, ProductVariant } from "@/lib/supabase";
import { useProductSalesQuery } from "@/hooks/use-product-sales-query";
import {
    useProductsQuery,
    useAddProductMutation,
    useUpdateProductMutation,
    useArchiveProductMutation,
    useRestoreProductMutation,
    useDeleteProductMutation,
    useBulkUpdatePricesMutation,
    useBulkArchiveMutation,
    useBulkRestoreMutation,
    useBulkDeleteMutation,
    useBulkUpdateVisibilityMutation,
    useBulkUpdateDisplayOrderMutation,
    useAddVariantMutation,
    useUpdateVariantMutation,
    useDeleteVariantMutation,
} from "@/hooks/use-products-query";

interface ProductFormData {
    name: string;
    description?: string;
    sku?: string; // Product SKU for LightFunnels matching
    price: number;
    compare_at_price?: number; // Original price before discount
    cost?: number;
    stock_quantity: number;
    open_box_quantity?: number;
    low_stock_threshold: number;
    image_url?: string;
    tag_color?: string; // Custom color for product tag display
    is_supply?: boolean;
    is_filler?: boolean;
    // Storefront fields
    slug?: string;
    is_visible?: boolean;
    display_order?: number;
    category_id?: string | null;
    website_price?: number | null;
    short_description?: string;
}

interface VariantFormData {
    name: string;
    price?: number;
    cost?: number;
    stock_quantity: number;
    sku?: string;
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
    const salesByProductId = useProductSalesQuery(withSales);

    // Mutations
    const addProductMutation = useAddProductMutation();
    const updateProductMutation = useUpdateProductMutation();
    const archiveProductMutation = useArchiveProductMutation();
    const restoreProductMutation = useRestoreProductMutation();
    const deleteProductMutation = useDeleteProductMutation();
    const bulkUpdatePricesMutation = useBulkUpdatePricesMutation();
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
            const profitMargin = product.cost
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

    const addProduct = (data: ProductFormData): Promise<Product> =>
        addProductMutation.mutateAsync(data);

    /** Resolves to the product's new updated_at (see productRepository.update). */
    const updateProduct = async (
        id: string,
        data: Omit<Partial<ProductFormData>, "stock_quantity">,
        opts: { expectedUpdatedAt?: string } = {},
    ): Promise<string | null> => {
        const { updatedAt } = await updateProductMutation.mutateAsync({ id, data, expectedUpdatedAt: opts.expectedUpdatedAt });
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

    const bulkUpdatePrices = async (productIds: string[], newPrice: number): Promise<void> => {
        await bulkUpdatePricesMutation.mutateAsync({ ids: productIds, price: newPrice });
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

    const addVariant = (productId: string, data: VariantFormData): Promise<ProductVariant> =>
        addVariantMutation.mutateAsync({ productId, data });

    const updateVariant = async (variantId: string, data: Omit<Partial<VariantFormData>, "stock_quantity">): Promise<void> => {
        await updateVariantMutation.mutateAsync({ id: variantId, data });
    };

    const deleteVariant = async (variantId: string): Promise<void> => {
        await deleteVariantMutation.mutateAsync(variantId);
    };

    const reorderProducts = async (updates: { id: string; display_order: number }[]): Promise<void> => {
        await bulkUpdateDisplayOrderMutation.mutateAsync(updates);
    };

    return {
        products: products || [],
        loading,
        /** True until the first result, including while the query waits for the session. */
        pending,
        error: queryError ? (queryError instanceof Error ? queryError.message : "Error fetching products") : null,
        // CRUD operations
        addProduct,
        updateProduct,
        archiveProduct,
        restoreProduct,
        deleteProduct,
        // Bulk operations
        bulkUpdatePrices,
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
