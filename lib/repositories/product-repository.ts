import { supabase } from "@/lib/supabase";
import type { Product, ProductVariant, ProductPriceHistory } from "@/types/product";

/**
 * ProductRepository — Centralized data access for products.
 */
export const productRepository = {
    /** Fetch all products with variants, newest first. */
    async findAll(): Promise<Product[]> {
        const { data, error } = await supabase
            .from("products")
            .select(`*, variants:product_variants(*)`)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return data || [];
    },

    /** Insert a new product. Returns the created product. */
    async create(productData: Omit<Product, "id" | "created_at" | "updated_at" | "variants">): Promise<Product> {
        const { sku, ...data } = productData as any;
        const { data: newProduct, error } = await supabase
            .from("products")
            .insert([{ ...data, is_archived: false }])
            .select()
            .single();

        if (error) throw error;
        return newProduct;
    },

    /** Update a product by ID. */
    async update(id: string, data: Partial<Product>): Promise<void> {
        const { sku, ...updateData } = data as any;
        const { error } = await supabase
            .from("products")
            .update(updateData)
            .eq("id", id);

        if (error) throw error;
    },

    /** Archive a product. */
    async archive(id: string): Promise<void> {
        const { error } = await supabase
            .from("products")
            .update({ is_archived: true })
            .eq("id", id);

        if (error) throw error;
    },

    /** Restore an archived product. */
    async restore(id: string): Promise<void> {
        const { error } = await supabase
            .from("products")
            .update({ is_archived: false })
            .eq("id", id);

        if (error) throw error;
    },

    /** Hard-delete a product. */
    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from("products")
            .delete()
            .eq("id", id);

        if (error) throw error;
    },

    /** Bulk-update price for multiple products. */
    async bulkUpdatePrice(ids: string[], price: number): Promise<void> {
        const { error } = await supabase
            .from("products")
            .update({ price })
            .in("id", ids);

        if (error) throw error;
    },

    /** Bulk-archive multiple products. */
    async bulkArchive(ids: string[]): Promise<void> {
        const { error } = await supabase
            .from("products")
            .update({ is_archived: true })
            .in("id", ids);

        if (error) throw error;
    },

    /** Fetch price history for a product. */
    async getPriceHistory(productId: string): Promise<ProductPriceHistory[]> {
        const { data, error } = await supabase
            .from("product_price_history")
            .select("*")
            .eq("product_id", productId)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return data || [];
    },

    // =============================================
    // VARIANT OPERATIONS
    // =============================================

    /** Add a variant to a product. */
    async addVariant(productId: string, data: Partial<ProductVariant>): Promise<ProductVariant> {
        const { data: newVariant, error } = await supabase
            .from("product_variants")
            .insert([{ product_id: productId, ...data }])
            .select()
            .single();

        if (error) throw error;
        return newVariant;
    },

    /** Update a variant. */
    async updateVariant(id: string, data: Partial<ProductVariant>): Promise<void> {
        const { error } = await supabase
            .from("product_variants")
            .update(data)
            .eq("id", id);

        if (error) throw error;
    },

    /** Delete a variant. */
    async deleteVariant(id: string): Promise<void> {
        const { error } = await supabase
            .from("product_variants")
            .delete()
            .eq("id", id);

        if (error) throw error;
    },
};
