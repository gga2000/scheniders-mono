import { supabase } from "@/lib/supabase";
import { withRetry } from "./with-retry";
import type { Product, ProductVariant, ProductPriceHistory } from "@/types/product";
import { diag } from "@/lib/diag";

/** A product as the top-bar search lists it. */
export type ProductSearchMatch = Pick<Product, "id" | "name" | "price">;

/**
 * ProductRepository — Centralized data access for products.
 */
export const productRepository = {
    /** Fetch all products with variants, newest first. */
    async findAll(): Promise<Product[]> {
        return withRetry('productRepository.findAll', async () => {
            const _t = performance.now();
            diag.log(`[Diag:ProductRepo] findAll query START`);

            const { data, error } = await supabase
                .from("products")
                .select(`*, variants:product_variants(*)`)
                .order("created_at", { ascending: false });

            diag.log(`[Diag:ProductRepo] findAll query DONE took=${(performance.now() - _t).toFixed(1)}ms rows=${data?.length ?? 0} error=${error?.message ?? 'none'}`);
            if (error) throw error;
            return data || [];
        });
    },

    /**
     * Products of `tenantId` whose name contains `term`, for the top-bar search.
     * Only the columns a result row shows, and at most `limit` of them, so a
     * keystroke never pulls the whole catalogue with its variants.
     *
     * `*` and `%` are LIKE wildcards (PostgREST's and Postgres's) and `\` escapes
     * the next character; none means anything in a product name, so they are
     * dropped rather than escaped. An empty remainder searches nothing.
     */
    async searchByName(tenantId: string, term: string, limit: number): Promise<ProductSearchMatch[]> {
        // Dropped: LIKE wildcards, and the quote / backslash that would end or
        // escape the double-quoted values below. Quoting keeps ',', '.', ':'
        // and parentheses in a term from breaking the `or` filter apart.
        const text = term.replace(/[*%"\\]/g, "").trim();
        if (!text) return [];
        // A product is searched by every name it goes by, not only the
        // catalogue name: order cards show the short name or the name the
        // order arrived with (e.g. "بيرسيفيرون" for "عطر برسيفيرون الفاخر…"),
        // and that is what a merchant types. The aliases are the names
        // imported orders used; an alias matches when typed in full.
        const like = `"*${text}*"`;
        const { data, error } = await supabase
            .from("products")
            .select("id, name, price")
            .eq("tenant_id", tenantId)
            .or(
                `name.ilike.${like},display_name.ilike.${like},short_name.ilike.${like},sku.ilike.${like},` +
                `lightfunnels_aliases.cs.{"${text}"}`,
            )
            .order("name", { ascending: true })
            .limit(limit);
        if (error) throw error;
        return (data ?? []) as ProductSearchMatch[];
    },

    /**
     * Recompute reserved_quantity for all products in the tenant from active
     * (RESERVED-phase) orders. Run after manual data fixes to re-sync.
     */
    async recomputeInventory(tenantId: string | null): Promise<void> {
        return withRetry('productRepository.recomputeInventory', async () => {
            const { error } = await supabase.rpc('recompute_inventory', { p_tenant_id: tenantId });
            if (error) throw error;
        });
    },

    /**
     * Top on-hand up to reserved for any product where reserved > on-hand,
     * so oversold becomes 0. Tenant-scoped. Supplies untouched.
     */
    async zeroOversold(tenantId: string | null): Promise<void> {
        return withRetry('productRepository.zeroOversold', async () => {
            const { error } = await supabase.rpc('zero_oversold', { p_tenant_id: tenantId });
            if (error) throw error;
        });
    },

    /** Insert a new product. Returns the created product. */
    async create(productData: Omit<Product, "id" | "created_at" | "updated_at" | "variants">, tenantId: string | null): Promise<Product> {
        return withRetry('productRepository.create', async () => {
            // Strip computed/joined fields that have no column on `products`.
            // NOTE: `sku` is a real, writable column (used by LightFunnels order
            // matching) — it must stay in the payload, not be stripped here.
            const { variants: _variants, times_sold: _ts, total_revenue: _tr, profit_margin: _pm, average_order_value: _aov, ...data } = productData as any;
            const { data: newProduct, error } = await supabase
                .from("products")
                .insert([{ ...data, is_archived: false, tenant_id: tenantId }])
                .select()
                .single();

            if (error) throw error;
            return newProduct;
        });
    },

    /** Update a product by ID. */
    async update(id: string, data: Partial<Product>): Promise<void> {
        return withRetry('productRepository.update', async () => {
            // Strip computed/joined fields and immutable keys. `sku` is a real,
            // writable column (LightFunnels order matching depends on it) — keep it.
            const { variants: _variants, times_sold: _ts, total_revenue: _tr, profit_margin: _pm, average_order_value: _aov, id: _id, created_at: _ca, ...updateData } = data as any;
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

    /** Bulk-restore multiple archived products. */
    async bulkRestore(ids: string[]): Promise<void> {
        return withRetry('productRepository.bulkRestore', async () => {
            const { error } = await supabase
                .from("products")
                .update({ is_archived: false })
                .in("id", ids);

            if (error) throw error;
        });
    },

    /** Bulk-delete multiple products permanently. */
    async bulkDelete(ids: string[]): Promise<void> {
        return withRetry('productRepository.bulkDelete', async () => {
            const { error } = await supabase
                .from("products")
                .delete()
                .in("id", ids);

            if (error) throw error;
        });
    },

    /** Bulk-update storefront visibility for multiple products. */
    async bulkUpdateVisibility(ids: string[], isVisible: boolean): Promise<void> {
        return withRetry('productRepository.bulkUpdateVisibility', async () => {
            const { error } = await supabase
                .from("products")
                .update({ is_visible: isVisible })
                .in("id", ids);

            if (error) throw error;
        });
    },

    /** Bulk-update category for multiple products. Pass null to clear category. */
    async bulkUpdateCategory(ids: string[], categoryId: string | null): Promise<void> {
        return withRetry('productRepository.bulkUpdateCategory', async () => {
            const { error } = await supabase
                .from("products")
                .update({ category_id: categoryId })
                .in("id", ids);

            if (error) throw error;
        });
    },

    /** Bulk-update display_order for multiple products. */
    async bulkUpdateDisplayOrder(updates: { id: string; display_order: number }[]): Promise<void> {
        return withRetry('productRepository.bulkUpdateDisplayOrder', async () => {
            // Supabase doesn't support batch updates with different values per row,
            // so we run them in parallel with Promise.all
            const promises = updates.map(({ id, display_order }) =>
                supabase
                    .from("products")
                    .update({ display_order })
                    .eq("id", id)
            );
            const results = await Promise.all(promises);
            const firstError = results.find((r) => r.error);
            if (firstError?.error) throw firstError.error;
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
    async addVariant(productId: string, data: Partial<ProductVariant>, tenantId: string | null): Promise<ProductVariant> {
        return withRetry('productRepository.addVariant', async () => {
            const { data: newVariant, error } = await supabase
                .from("product_variants")
                .insert([{ product_id: productId, ...data, tenant_id: tenantId }])
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

    // =============================================
    // PRODUCT OPTIONS
    // =============================================

    /** Fetch all options for a product, ordered by display_order. */
    async getProductOptions(productId: string): Promise<any[]> {
        return withRetry('productRepository.getProductOptions', async () => {
            const { data, error } = await supabase
                .from("product_options")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },

    /** Replace all options for a product (delete existing, insert new). */
    async saveProductOptions(productId: string, options: { name: string; values: string[]; display_order: number; option_type?: string; values_metadata?: any }[], tenantId: string | null): Promise<void> {
        return withRetry('productRepository.saveProductOptions', async () => {
            const { error: deleteError } = await supabase
                .from("product_options")
                .delete()
                .eq("product_id", productId);

            if (deleteError) throw deleteError;

            if (options.length > 0) {
                const rows = options.map((o) => ({ product_id: productId, tenant_id: tenantId, ...o }));
                const { error: insertError } = await supabase
                    .from("product_options")
                    .insert(rows);

                if (insertError) throw insertError;
            }
        });
    },

    // =============================================
    // TIERED PRICING
    // =============================================

    /** Fetch tiered pricing for a product, ordered by min_quantity. */
    async getTieredPrices(productId: string): Promise<any[]> {
        return withRetry('productRepository.getTieredPrices', async () => {
            const { data, error } = await supabase
                .from("product_tiered_pricing")
                .select("*")
                .eq("product_id", productId)
                .order("min_quantity", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },

    /** Replace all tiered prices for a product. */
    async saveTieredPrices(productId: string, tiers: { min_quantity: number; max_quantity: number | null; price: number }[], tenantId: string | null): Promise<void> {
        return withRetry('productRepository.saveTieredPrices', async () => {
            const { error: deleteError } = await supabase
                .from("product_tiered_pricing")
                .delete()
                .eq("product_id", productId);

            if (deleteError) throw deleteError;

            if (tiers.length > 0) {
                const rows = tiers.map((t) => ({ product_id: productId, tenant_id: tenantId, ...t }));
                const { error: insertError } = await supabase
                    .from("product_tiered_pricing")
                    .insert(rows);

                if (insertError) throw insertError;
            }
        });
    },

    // =============================================
    // ORDER BUMPS
    // =============================================

    /** Fetch order bumps for a product, ordered by display_order. */
    async getOrderBumps(productId: string): Promise<any[]> {
        return withRetry('productRepository.getOrderBumps', async () => {
            const { data, error } = await supabase
                .from("product_order_bumps")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },

    /** Replace all order bumps for a product. */
    async saveOrderBumps(productId: string, bumps: { bump_product_id: string; discount_percentage: number; headline: string; description: string; display_order: number; is_active: boolean }[], tenantId: string | null): Promise<void> {
        return withRetry('productRepository.saveOrderBumps', async () => {
            const { error: deleteError } = await supabase
                .from("product_order_bumps")
                .delete()
                .eq("product_id", productId);

            if (deleteError) throw deleteError;

            if (bumps.length > 0) {
                const rows = bumps.map((b) => ({ product_id: productId, tenant_id: tenantId, ...b }));
                const { error: insertError } = await supabase
                    .from("product_order_bumps")
                    .insert(rows);

                if (insertError) throw insertError;
            }
        });
    },

    // =============================================
    // RELATED PRODUCTS
    // =============================================

    /** Fetch related products, ordered by display_order. */
    async getRelatedProducts(productId: string): Promise<any[]> {
        return withRetry('productRepository.getRelatedProducts', async () => {
            const { data, error } = await supabase
                .from("product_related")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },

    /** Replace all related products for a product. */
    async saveRelatedProducts(productId: string, related: { related_product_id: string; relation_type: string; display_order: number }[], tenantId: string | null): Promise<void> {
        return withRetry('productRepository.saveRelatedProducts', async () => {
            const { error: deleteError } = await supabase
                .from("product_related")
                .delete()
                .eq("product_id", productId);

            if (deleteError) throw deleteError;

            if (related.length > 0) {
                const rows = related.map((r) => ({ product_id: productId, tenant_id: tenantId, ...r }));
                const { error: insertError } = await supabase
                    .from("product_related")
                    .insert(rows);

                if (insertError) throw insertError;
            }
        });
    },

    // =============================================
    // INVENTORY HISTORY (immutable log — insert only)
    // =============================================

    /** Fetch inventory history for a product, newest first. */
    async getInventoryHistory(productId: string): Promise<any[]> {
        return withRetry('productRepository.getInventoryHistory', async () => {
            const { data, error } = await supabase
                .from("inventory_history")
                .select("*")
                .eq("product_id", productId)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data || [];
        });
    },

    /** Add a single inventory history entry (immutable log). */
    async addInventoryEntry(productId: string, entry: { change_type: string; quantity_change: number; quantity_before: number; quantity_after: number; reference_id?: string; notes?: string; changed_by?: string }, tenantId: string | null): Promise<void> {
        return withRetry('productRepository.addInventoryEntry', async () => {
            const { error } = await supabase
                .from("inventory_history")
                .insert([{ product_id: productId, tenant_id: tenantId, ...entry }]);

            if (error) throw error;
        });
    },

    // =============================================
    // SUPPLIERS
    // =============================================

    /** Fetch suppliers for a product, primary first then by created_at. */
    async getSuppliers(productId: string): Promise<any[]> {
        return withRetry('productRepository.getSuppliers', async () => {
            const { data, error } = await supabase
                .from("product_suppliers")
                .select("*")
                .eq("product_id", productId)
                .order("is_primary", { ascending: false })
                .order("created_at", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },

    /** Replace all suppliers for a product. */
    async saveSuppliers(productId: string, suppliers: { supplier_name: string; supplier_contact?: string; supplier_email?: string; lead_time_days?: number | null; minimum_order_quantity?: number | null; unit_cost?: number | null; notes?: string; is_primary: boolean }[], tenantId: string | null): Promise<void> {
        return withRetry('productRepository.saveSuppliers', async () => {
            const { error: deleteError } = await supabase
                .from("product_suppliers")
                .delete()
                .eq("product_id", productId);

            if (deleteError) throw deleteError;

            if (suppliers.length > 0) {
                const rows = suppliers.map((s) => ({ product_id: productId, tenant_id: tenantId, ...s }));
                const { error: insertError } = await supabase
                    .from("product_suppliers")
                    .insert(rows);

                if (insertError) throw insertError;
            }
        });
    },

    // =============================================
    // ACTIVITY LOG (immutable log — insert only)
    // =============================================

    /** Fetch recent activity log entries for a product (max 50). */
    async getActivityLog(productId: string): Promise<any[]> {
        return withRetry('productRepository.getActivityLog', async () => {
            const { data, error } = await supabase
                .from("product_activity_log")
                .select("*")
                .eq("product_id", productId)
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) throw error;
            return data || [];
        });
    },

    /** Add a single activity log entry (immutable log). */
    async addActivityLogEntry(productId: string, entry: { action: string; changes_json?: any; user_id?: string }, tenantId: string | null): Promise<void> {
        return withRetry('productRepository.addActivityLogEntry', async () => {
            const { error } = await supabase
                .from("product_activity_log")
                .insert([{ product_id: productId, tenant_id: tenantId, ...entry }]);

            if (error) throw error;
        });
    },

    // =============================================
    // PRICE HISTORY (immutable log — insert only)
    // =============================================

    /** Add a single price history entry. */
    async addPriceHistoryEntry(productId: string, entry: { old_price?: number; new_price: number; changed_by?: string; reason?: string }, tenantId: string | null): Promise<void> {
        return withRetry('productRepository.addPriceHistoryEntry', async () => {
            const { error } = await supabase
                .from("product_price_history")
                .insert([{ product_id: productId, tenant_id: tenantId, ...entry }]);

            if (error) throw error;
        });
    },

    // =============================================
    // BUNDLE ITEMS
    // =============================================

    /** Fetch bundle items for a product, ordered by display_order. */
    async getBundleItems(productId: string): Promise<any[]> {
        return withRetry('productRepository.getBundleItems', async () => {
            const { data, error } = await supabase
                .from("product_bundle_items")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },

    /** Replace all bundle items for a product. */
    async saveBundleItems(productId: string, items: { child_product_id: string; quantity: number; display_order: number }[], tenantId: string | null): Promise<void> {
        return withRetry('productRepository.saveBundleItems', async () => {
            const { error: deleteError } = await supabase
                .from("product_bundle_items")
                .delete()
                .eq("product_id", productId);

            if (deleteError) throw deleteError;

            if (items.length > 0) {
                const rows = items.map((i) => ({ product_id: productId, tenant_id: tenantId, ...i }));
                const { error: insertError } = await supabase
                    .from("product_bundle_items")
                    .insert(rows);

                if (insertError) throw insertError;
            }
        });
    },
};
