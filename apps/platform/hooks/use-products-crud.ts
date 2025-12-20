"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase, Product, ProductVariant, ProductPriceHistory, getStockStatus } from "@/lib/supabase";
import { useOrders } from "./use-orders";

interface ProductFormData {
    name: string;
    description?: string;
    sku?: string; // Product SKU for LightFunnels matching
    price: number;
    cost?: number;
    stock_quantity: number;
    low_stock_threshold: number;
    image_url?: string;
}

interface VariantFormData {
    name: string;
    price?: number;
    cost?: number;
    stock_quantity: number;
    sku?: string;
}

export function useProductsCrud() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { orders } = useOrders();

    // Fetch products from database
    const fetchProducts = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from("products")
                .select(`
                    *,
                    variants:product_variants(*)
                `)
                .order("created_at", { ascending: false });

            if (fetchError) throw fetchError;

            // Enrich products with sales data from orders (matches by SKU or name)
            const enrichedProducts = (data || []).map((product) => {
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

            setProducts(enrichedProducts);
        } catch (err) {
            console.error("Error fetching products:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch products");
        } finally {
            setLoading(false);
        }
    }, [orders]);

    // Calculate sales data from orders - matches by SKU first, then name
    const calculateProductSales = (product: { name: string; sku?: string }, ordersList: typeof orders) => {
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
    };

    // Add new product
    const addProduct = async (data: ProductFormData): Promise<Product | null> => {
        try {
            // Exclude sku since the column doesn't exist in the database
            const { sku, ...productData } = data;

            const { data: newProduct, error: insertError } = await supabase
                .from("products")
                .insert([{
                    ...productData,
                    is_archived: false,
                }])
                .select()
                .single();

            if (insertError) throw insertError;

            await fetchProducts();
            return newProduct;
        } catch (err) {
            console.error("Error adding product:", err);
            setError(err instanceof Error ? err.message : "Failed to add product");
            return null;
        }
    };

    // Update product
    const updateProduct = async (id: string, data: Partial<ProductFormData>): Promise<boolean> => {
        try {
            // Exclude sku since the column doesn't exist
            const { sku, ...updateData } = data as ProductFormData;

            const { error: updateError } = await supabase
                .from("products")
                .update(updateData)
                .eq("id", id);

            if (updateError) throw updateError;

            await fetchProducts();
            return true;
        } catch (err) {
            console.error("Error updating product:", err);
            setError(err instanceof Error ? err.message : "Failed to update product");
            return false;
        }
    };

    // Archive product (soft delete)
    const archiveProduct = async (id: string): Promise<boolean> => {
        try {
            const { error: archiveError } = await supabase
                .from("products")
                .update({ is_archived: true })
                .eq("id", id);

            if (archiveError) throw archiveError;

            await fetchProducts();
            return true;
        } catch (err) {
            console.error("Error archiving product:", err);
            setError(err instanceof Error ? err.message : "Failed to archive product");
            return false;
        }
    };

    // Restore archived product
    const restoreProduct = async (id: string): Promise<boolean> => {
        try {
            const { error: restoreError } = await supabase
                .from("products")
                .update({ is_archived: false })
                .eq("id", id);

            if (restoreError) throw restoreError;

            await fetchProducts();
            return true;
        } catch (err) {
            console.error("Error restoring product:", err);
            setError(err instanceof Error ? err.message : "Failed to restore product");
            return false;
        }
    };

    // Delete product permanently
    const deleteProduct = async (id: string): Promise<boolean> => {
        try {
            const { error: deleteError } = await supabase
                .from("products")
                .delete()
                .eq("id", id);

            if (deleteError) throw deleteError;

            await fetchProducts();
            return true;
        } catch (err) {
            console.error("Error deleting product:", err);
            setError(err instanceof Error ? err.message : "Failed to delete product");
            return false;
        }
    };

    // Bulk update prices
    const bulkUpdatePrices = async (productIds: string[], newPrice: number): Promise<boolean> => {
        try {
            const { error: updateError } = await supabase
                .from("products")
                .update({ price: newPrice })
                .in("id", productIds);

            if (updateError) throw updateError;

            await fetchProducts();
            return true;
        } catch (err) {
            console.error("Error bulk updating prices:", err);
            setError(err instanceof Error ? err.message : "Failed to bulk update prices");
            return false;
        }
    };

    // Bulk archive products
    const bulkArchive = async (productIds: string[]): Promise<boolean> => {
        try {
            const { error: archiveError } = await supabase
                .from("products")
                .update({ is_archived: true })
                .in("id", productIds);

            if (archiveError) throw archiveError;

            await fetchProducts();
            return true;
        } catch (err) {
            console.error("Error bulk archiving:", err);
            setError(err instanceof Error ? err.message : "Failed to bulk archive");
            return false;
        }
    };

    // Add variant to product
    const addVariant = async (productId: string, data: VariantFormData): Promise<ProductVariant | null> => {
        try {
            const { data: newVariant, error: insertError } = await supabase
                .from("product_variants")
                .insert([{
                    product_id: productId,
                    ...data,
                }])
                .select()
                .single();

            if (insertError) throw insertError;

            await fetchProducts();
            return newVariant;
        } catch (err) {
            console.error("Error adding variant:", err);
            setError(err instanceof Error ? err.message : "Failed to add variant");
            return null;
        }
    };

    // Update variant
    const updateVariant = async (variantId: string, data: Partial<VariantFormData>): Promise<boolean> => {
        try {
            const { error: updateError } = await supabase
                .from("product_variants")
                .update(data)
                .eq("id", variantId);

            if (updateError) throw updateError;

            await fetchProducts();
            return true;
        } catch (err) {
            console.error("Error updating variant:", err);
            setError(err instanceof Error ? err.message : "Failed to update variant");
            return false;
        }
    };

    // Delete variant
    const deleteVariant = async (variantId: string): Promise<boolean> => {
        try {
            const { error: deleteError } = await supabase
                .from("product_variants")
                .delete()
                .eq("id", variantId);

            if (deleteError) throw deleteError;

            await fetchProducts();
            return true;
        } catch (err) {
            console.error("Error deleting variant:", err);
            setError(err instanceof Error ? err.message : "Failed to delete variant");
            return false;
        }
    };

    // Get price history for a product
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

            // Update product with image URL
            await updateProduct(productId, { image_url: urlData.publicUrl });

            return urlData.publicUrl;
        } catch (err) {
            console.error("Error uploading image:", err);
            setError(err instanceof Error ? err.message : "Failed to upload image");
            return null;
        }
    };

    // Get low stock products
    const getLowStockProducts = useCallback(() => {
        return products.filter((p) => !p.is_archived && getStockStatus(p) !== "in_stock");
    }, [products]);

    // Initial fetch
    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    // Setup real-time subscription
    useEffect(() => {
        const subscription = supabase
            .channel("products-changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "products" },
                () => {
                    fetchProducts();
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [fetchProducts]);

    return {
        products,
        loading,
        error,
        // CRUD operations
        addProduct,
        updateProduct,
        archiveProduct,
        restoreProduct,
        deleteProduct,
        // Bulk operations
        bulkUpdatePrices,
        bulkArchive,
        // Variant operations
        addVariant,
        updateVariant,
        deleteVariant,
        // Utilities
        getPriceHistory,
        uploadProductImage,
        getLowStockProducts,
        refetch: fetchProducts,
    };
}
