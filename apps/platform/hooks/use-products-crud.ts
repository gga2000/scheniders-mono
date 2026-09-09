"use client";

import { useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, type Product, type ProductVariant, type ProductPriceHistory, getStockStatus } from "@/lib/supabase";
import { useOrdersList } from "@/components/providers/orders-provider";
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
    usePriceHistoryQuery,
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

export function useProductsCrud() {
    const queryClient = useQueryClient();
    const { data: rawProducts, isLoading: loading, error: queryError } = useProductsQuery();
    const { orders } = useOrdersList();

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

    // Calculate sales data from orders - matches by SKU first, then name
    const calculateProductSales = useCallback((product: { name: string; sku?: string }, ordersList: typeof orders) => {
        let timesSold = 0;
        let totalRevenue = 0;
        let orderCount = 0;

        ordersList.forEach((order) => {
            if (!order.items) return;
            order.items.forEach((item) => {
                // Match by SKU first (most accurate)
                const skuMatch = product.sku && item.sku &&
                    item.sku.toLowerCase().trim() === product.sku.toLowerCase().trim();

                // Fallback to name matching if no SKU
                const nameMatch = item.name.toLowerCase().trim() === product.name.toLowerCase().trim();

                if (skuMatch || (!product.sku && nameMatch)) {
                    timesSold += item.quantity;
                    totalRevenue += item.price * item.quantity;
                    orderCount++;
                }
            });
        });

        return {
            timesSold,
            totalRevenue,
            averageOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
        };
    }, []);

    // Enrich products with sales data
    const products = useMemo(() => {
        return (rawProducts || []).map((product) => {
            const salesData = calculateProductSales({ name: product.name, sku: product.sku }, orders);
            const profitMargin = product.cost
                ? ((product.price - product.cost) / product.price) * 100
                : undefined;

            return {
                ...product,
                times_sold: salesData.timesSold,
                total_revenue: salesData.totalRevenue,
                average_order_value: salesData.averageOrderValue,
                profit_margin: profitMargin,
            };
        });
    }, [rawProducts, orders, calculateProductSales]);

    // =============================================
    // CRUD Operations Wrappers
    // =============================================

    const addProduct = async (data: ProductFormData): Promise<Product | null> => {
        try {
            return await addProductMutation.mutateAsync(data);
        } catch (err) {
            console.error("Error adding product:", err);
            return null;
        }
    };

    const updateProduct = async (id: string, data: Partial<ProductFormData>): Promise<boolean> => {
        try {
            await updateProductMutation.mutateAsync({ id, data });
            return true;
        } catch (err) {
            console.error("Error updating product:", err);
            return false;
        }
    };

    const archiveProduct = async (id: string): Promise<boolean> => {
        try {
            await archiveProductMutation.mutateAsync(id);
            return true;
        } catch (err) {
            console.error("Error archiving product:", err);
            return false;
        }
    };

    const restoreProduct = async (id: string): Promise<boolean> => {
        try {
            await restoreProductMutation.mutateAsync(id);
            return true;
        } catch (err) {
            console.error("Error restoring product:", err);
            return false;
        }
    };

    const deleteProduct = async (id: string): Promise<boolean> => {
        try {
            await deleteProductMutation.mutateAsync(id);
            return true;
        } catch (err) {
            console.error("Error deleting product:", err);
            return false;
        }
    };

    const bulkUpdatePrices = async (productIds: string[], newPrice: number): Promise<boolean> => {
        try {
            await bulkUpdatePricesMutation.mutateAsync({ ids: productIds, price: newPrice });
            return true;
        } catch (err) {
            console.error("Error bulk updating prices:", err);
            return false;
        }
    };

    const bulkArchive = async (productIds: string[]): Promise<boolean> => {
        try {
            await bulkArchiveMutation.mutateAsync(productIds);
            return true;
        } catch (err) {
            console.error("Error bulk archiving:", err);
            return false;
        }
    };

    const bulkRestore = async (productIds: string[]): Promise<boolean> => {
        try {
            await bulkRestoreMutation.mutateAsync(productIds);
            return true;
        } catch (err) {
            console.error("Error bulk restoring:", err);
            return false;
        }
    };

    const bulkDelete = async (productIds: string[]): Promise<boolean> => {
        try {
            await bulkDeleteMutation.mutateAsync(productIds);
            return true;
        } catch (err) {
            console.error("Error bulk deleting:", err);
            return false;
        }
    };

    const bulkUpdateVisibility = async (productIds: string[], isVisible: boolean): Promise<boolean> => {
        try {
            await bulkUpdateVisibilityMutation.mutateAsync({ ids: productIds, isVisible });
            return true;
        } catch (err) {
            console.error("Error bulk updating visibility:", err);
            return false;
        }
    };

    // =============================================
    // Variant Operations Wrappers
    // =============================================

    const addVariant = async (productId: string, data: VariantFormData): Promise<ProductVariant | null> => {
        try {
            return await addVariantMutation.mutateAsync({ productId, data });
        } catch (err) {
            console.error("Error adding variant:", err);
            return null;
        }
    };

    const updateVariant = async (variantId: string, data: Partial<VariantFormData>): Promise<boolean> => {
        try {
            await updateVariantMutation.mutateAsync({ id: variantId, data });
            return true;
        } catch (err) {
            console.error("Error updating variant:", err);
            return false;
        }
    };

    const deleteVariant = async (variantId: string): Promise<boolean> => {
        try {
            await deleteVariantMutation.mutateAsync(variantId);
            return true;
        } catch (err) {
            console.error("Error deleting variant:", err);
            return false;
        }
    };

    const reorderProducts = async (updates: { id: string; display_order: number }[]): Promise<boolean> => {
        try {
            await bulkUpdateDisplayOrderMutation.mutateAsync(updates);
            return true;
        } catch (err) {
            console.error("Error reordering products:", err);
            return false;
        }
    };

    // Note: getPriceHistory still calls supabase directly in original?
    // We added usePriceHistoryQuery, but the original returned a Promise array.
    // To match interface, we can keep the manual fetch OR change consumers.
    // Consumers likely await it.
    // Let's keep the manual fetch wrapper for now to verify compatibility,
    // or just re-implement the fetch here.
    // Actually, `usePriceHistoryQuery` is a hook, can't be called inside a function.
    // So `getPriceHistory` helper function must remain "pessimistic" or standard fetch.
    const getPriceHistory = async (productId: string): Promise<ProductPriceHistory[]> => {
        try {
            const { data, error: fetchError } = await supabase
                .from("product_price_history")
                .select("*")
                .eq("product_id", productId)
                .order("created_at", { ascending: false });

            if (fetchError) throw fetchError;
            return data || [];
        } catch (err) {
            console.error("Error fetching price history:", err);
            return [];
        }
    };

    // Upload product image
    const uploadProductImage = async (productId: string, file: File): Promise<string | null> => {
        try {
            const fileExt = file.name.split(".").pop();
            const fileName = `${productId}-${Date.now()}.${fileExt}`;
            const filePath = `products/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from("product-images")
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from("product-images")
                .getPublicUrl(filePath);

            // Update product with image URL via mutation
            await updateProductMutation.mutateAsync({ id: productId, data: { image_url: urlData.publicUrl } });

            return urlData.publicUrl;
        } catch (err) {
            console.error("Error uploading image:", err);
            return null;
        }
    };

    const getLowStockProducts = useCallback(() => {
        return (products || []).filter((p) => !p.is_archived && getStockStatus(p) !== "in_stock");
    }, [products]);

    // Refetch wrapper
    const refetch = async () => {
        // useProductsQuery handles automatic refetching, but if we need manual:
        // we can return the refetch function from query
        // But query.refetch returns QueryResult, here we expect void or Promise
    };

    return {
        products: products || [],
        loading,
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
        // Utilities
        getPriceHistory,
        uploadProductImage,
        getLowStockProducts,
        refetch: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); },
    };
}
