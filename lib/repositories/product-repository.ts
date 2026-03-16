import { supabase } from "@/lib/supabase";
import { withRetry } from "./with-retry";
import type { Product, ProductVariant, ProductPriceHistory } from "@/types/product";

/**
 * ProductRepository — Centralized data access for products.
 */
export const productRepository = {
    /** Fetch all products with variants, newest first. */
    async findAll(): Promise<Product[]> {
        return withRetry('productRepository.findAll', async () => {
            const _t = performance.now();
            console.log(`[Diag:ProductRepo] findAll query START`);

            const { data, error } = await supabase
                .from("products")
                .select(`*, variants:product_variants(*)`)
                .order("created_at", { ascending: false });

            console.log(`[Diag:ProductRepo] findAll query DONE took=${(performance.now() - _t).toFixed(1)}ms rows=${data?.length ?? 0} error=${error?.message ?? 'none'}`);
            if (error) throw error;
            return data || [];
        });
    },

    /** Insert a new product. Returns the created product. */
    async create(productData: Omit<Product, "id" | "created_at" | "updated_at" | "variants">): Promise<Product> {
        return withRetry('productRepository.create', async () => {
            const { sku, ...data } = productData as any;
            const { data: newProduct, error } = await supabase
                .from("products")
                .insert([{ ...data, is_archived: false }])
                .select()
                .single();

            if (error) throw error;
            return newProduct;
        });
    },

    /** Update a product by ID. */
    async update(id: string, data: Partial<Product>): Promise<void> {
        return withRetry('productRepository.update', async () => {
            const { sku, ...updateData } = data as any;
            const { error } = await supabase
                .from("products")
                .update(updateData)
                .eq("id", id);

            if (error) throw error;
        });
    },

    /** Archive a product. */
    async archive(id: string): Promise<void> {
        return withRetry('productRepository.archive', async () => {
            const { error } = await supabase
                .from("products")
                .update({ is_archived: true })
                .eq("id", id);

            if (error) throw error;
        });
    },

    /** Restore an archived product. */
    async restore(id: string): Promise<void> {
        return withRetry('productRepository.restore', async () => {
            const { error } = await supabase
                .from("products")
                .update({ is_archived: false })
                .eq("id", id);

            if (error) throw error;
        });
    },

    /** Hard-delete a product. */
    async delete(id: string): Promise<void> {
        return withRetry('productRepository.delete', async () => {
            const { error } = await supabase
                .from("products")
                .delete()
                .eq("id", id);

            if (error) throw error;
        });
    },

    /** Bulk-update price for multiple products. */
    async bulkUpdatePrice(ids: string[], price: number): Promise<void> {
        return withRetry('productRepository.bulkUpdatePrice', async () => {
            const { error } = await supabase
                .from("products")
                .update({ price })
                .in("id", ids);

            if (error) throw error;
        });
    },

    /** Bulk-archive multiple products. */
    async bulkArchive(ids: string[]): Promise<void> {
        return withRetry('productRepository.bulkArchive', async () => {
            const { error } = await supabase
                .from("products")
                .update({ is_archived: true })
                .in("id", ids);

            if (error) throw error;
        });
    },

    /** Fetch price history for a product. */
    async getPriceHistory(productId: string): Promise<ProductPriceHistory[]> {
        return withRetry('productRepository.getPriceHistory', async () => {
            const { data, error } = await supabase
                .from("product_price_history")
                .select("*")
                .eq("product_id", productId)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data || [];
        });
    },

    // =============================================
    // VARIANT OPERATIONS
    // =============================================

    /** Add a variant to a product. */
    async addVariant(productId: string, data: Partial<ProductVariant>): Promise<ProductVariant> {
        return withRetry('productRepository.addVariant', async () => {
            const { data: newVariant, error } = await supabase
                .from("product_variants")
                .insert([{ product_id: productId, ...data }])
                .select()
                .single();

            if (error) throw error;
            return newVariant;
        });
    },

    /** Update a variant. */
    async updateVariant(id: string, data: Partial<ProductVariant>): Promise<void> {
        return withRetry('productRepository.updateVariant', async () => {
            const { error } = await supabase
                .from("product_variants")
                .update(data)
                .eq("id", id);

            if (error) throw error;
        });
    },

    /** Delete a variant. */
    async deleteVariant(id: string): Promise<void> {
        return withRetry('productRepository.deleteVariant', async () => {
            const { error } = await supabase
                .from("product_variants")
                .delete()
                .eq("id", id);

            if (error) throw error;
        });
    },
};
