import { supabase } from "@/lib/supabase";
import { withRetry } from "./with-retry";
import type { Product, ProductVariant, ProductPriceHistory } from "@/types/product";
import { diag } from "@/lib/diag";

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

    /** Insert a new product. Returns the created product. */
    async create(productData: Omit<Product, "id" | "created_at" | "updated_at" | "variants">, tenantId: string | null): Promise<Product> {
        return withRetry('productRepository.create', async () => {
            const { sku: _sku, variants: _variants, times_sold: _ts, total_revenue: _tr, profit_margin: _pm, average_order_value: _aov, ...data } = productData as any;
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
            const { sku: _sku, variants: _variants, times_sold: _ts, total_revenue: _tr, profit_margin: _pm, average_order_value: _aov, id: _id, created_at: _ca, ...updateData } = data as any;
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
    async saveProductOptions(productId: string, options: { name: string; values: string[]; display_order: number }[], tenantId: string | null): Promise<void> {
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
    // FEATURES
    // =============================================

    /** Fetch features for a product, ordered by display_order. */
    async getFeatures(productId: string): Promise<any[]> {
        return withRetry('productRepository.getFeatures', async () => {
            const { data, error } = await supabase
                .from("product_features")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },

    /** Replace all features for a product. */
    async saveFeatures(productId: string, features: { icon: string; title: string; description: string; display_order: number }[], tenantId: string | null): Promise<void> {
        return withRetry('productRepository.saveFeatures', async () => {
            const { error: deleteError } = await supabase
                .from("product_features")
                .delete()
                .eq("product_id", productId);

            if (deleteError) throw deleteError;

            if (features.length > 0) {
                const rows = features.map((f) => ({ product_id: productId, tenant_id: tenantId, ...f }));
                const { error: insertError } = await supabase
                    .from("product_features")
                    .insert(rows);

                if (insertError) throw insertError;
            }
        });
    },

    // =============================================
    // FAQS
    // =============================================

    /** Fetch FAQs for a product, ordered by display_order. */
    async getFaqs(productId: string): Promise<any[]> {
        return withRetry('productRepository.getFaqs', async () => {
            const { data, error } = await supabase
                .from("product_faqs")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },

    /** Replace all FAQs for a product. */
    async saveFaqs(productId: string, faqs: { question: string; answer: string; display_order: number }[], tenantId: string | null): Promise<void> {
        return withRetry('productRepository.saveFaqs', async () => {
            const { error: deleteError } = await supabase
                .from("product_faqs")
                .delete()
                .eq("product_id", productId);

            if (deleteError) throw deleteError;

            if (faqs.length > 0) {
                const rows = faqs.map((f) => ({ product_id: productId, tenant_id: tenantId, ...f }));
                const { error: insertError } = await supabase
                    .from("product_faqs")
                    .insert(rows);

                if (insertError) throw insertError;
            }
        });
    },

    // =============================================
    // TESTIMONIALS
    // =============================================

    /** Fetch testimonials for a product, ordered by display_order. */
    async getTestimonials(productId: string): Promise<any[]> {
        return withRetry('productRepository.getTestimonials', async () => {
            const { data, error } = await supabase
                .from("product_testimonials")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },

    /** Replace all testimonials for a product. */
    async saveTestimonials(productId: string, testimonials: { customer_name: string; customer_photo_url?: string | null; rating: number; quote: string; is_featured: boolean; display_order: number }[], tenantId: string | null): Promise<void> {
        return withRetry('productRepository.saveTestimonials', async () => {
            const { error: deleteError } = await supabase
                .from("product_testimonials")
                .delete()
                .eq("product_id", productId);

            if (deleteError) throw deleteError;

            if (testimonials.length > 0) {
                const rows = testimonials.map((t) => ({ product_id: productId, tenant_id: tenantId, ...t }));
                const { error: insertError } = await supabase
                    .from("product_testimonials")
                    .insert(rows);

                if (insertError) throw insertError;
            }
        });
    },

    // =============================================
    // REVIEWS
    // =============================================

    /** Fetch reviews for a product, newest first. */
    async getReviews(productId: string): Promise<any[]> {
        return withRetry('productRepository.getReviews', async () => {
            const { data, error } = await supabase
                .from("product_reviews")
                .select("*")
                .eq("product_id", productId)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data || [];
        });
    },

    /** Replace all reviews for a product. */
    async saveReviews(productId: string, reviews: { reviewer_name: string; reviewer_email?: string; rating: number; title: string; body: string; status: string; is_verified_purchase: boolean; is_manual: boolean; admin_response?: string | null; helpful_count: number }[], tenantId: string | null): Promise<void> {
        return withRetry('productRepository.saveReviews', async () => {
            const { error: deleteError } = await supabase
                .from("product_reviews")
                .delete()
                .eq("product_id", productId);

            if (deleteError) throw deleteError;

            if (reviews.length > 0) {
                const rows = reviews.map((r) => ({ product_id: productId, tenant_id: tenantId, ...r }));
                const { error: insertError } = await supabase
                    .from("product_reviews")
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
