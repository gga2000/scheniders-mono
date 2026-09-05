"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Product, ProductVariant, VariantOptionType, OptionValueMetadata, CostBreakdown } from "@/types/product";
import { slugify } from "@scheniders/shared";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useAutoSave } from "@/hooks/use-auto-save";
import { productRepository } from "@/lib/repositories/product-repository";
import { useAuth } from "@/components/auth/auth-provider";

export interface ProductOptionFormData {
    id?: string;
    name: string;
    values: string[];
    option_type?: VariantOptionType;
    values_metadata?: OptionValueMetadata[];
}

export interface ProductEditorFormData {
    // Basic info
    name: string;
    description: string;
    short_description: string;
    sku: string;

    // Media
    image_url: string;

    // Pricing
    price: number;
    compare_at_price: number;
    cost: number;

    // Inventory
    stock_quantity: number;
    low_stock_threshold: number;
    reorder_point: number | null;

    // Status & display
    status: 'draft' | 'active' | 'archived';
    is_supply: boolean;
    tag_color: string;

    // Barcode
    barcode: string;

    // Landed cost
    cost_breakdown_json: CostBreakdown | null;

    // Storefront
    slug: string;
    is_visible: boolean;
    display_order: number;
    category_id: string | null;
    website_price: number | null;

    // Variant options & variants
    variant_options: ProductOptionFormData[];
    variants: VariantFormData[];

    // Product type
    product_type: 'physical' | 'digital' | 'service' | 'bundle';

    // Physical fields
    weight: number | null;
    dimensions_length: number | null;
    dimensions_width: number | null;
    dimensions_height: number | null;

    // Digital fields
    download_url: string;
    file_size: string;
    license_key_pattern: string;

    // Service fields
    duration_minutes: number | null;
    booking_enabled: boolean;

    // Bundle fields
    bundle_items: BundleItemFormData[];

    // Pricing & commerce
    tiered_prices: TieredPriceFormData[];
    order_bumps: OrderBumpFormData[];
    related_products: RelatedProductFormData[];

    // CMS
    features: FeatureFormData[];
    faqs: FaqFormData[];
    testimonials: TestimonialFormData[];
    reviews: ReviewFormData[];

    // Funnel PDP note cards (products.feature_cards jsonb column)
    feature_cards: NoteCardFormData[];

    // Inventory & supply chain
    inventory_history: InventoryHistoryFormData[];
    suppliers: SupplierFormData[];

    // Analytics & activity
    activity_log: ActivityLogFormData[];
    price_history: PriceHistoryFormData[];
}

export interface TieredPriceFormData {
    min_quantity: number;
    max_quantity: number | null;
    price: number;
}

export interface OrderBumpFormData {
    bump_product_id: string;
    discount_percentage: number;
    headline: string;
    description: string;
    display_order: number;
    is_active: boolean;
    bump_product_name?: string;
    bump_product_price?: number;
    bump_product_image?: string;
}

export interface RelatedProductFormData {
    related_product_id: string;
    relation_type: 'complementary' | 'similar' | 'upsell';
    display_order: number;
    name?: string;
    price?: number;
    image_url?: string;
}

export interface FeatureFormData {
    icon: string;
    title: string;
    description: string;
    display_order: number;
}

/** Form row for one funnel-PDP note card (products.feature_cards jsonb).
 *  `image_url` is "" while unset — serialized to an absent key on save. */
export interface NoteCardFormData {
    image_url: string;
    title: string;
    body: string;
}

/** Coerce the raw jsonb value into well-shaped form rows; malformed entries
 *  are dropped (mirrors the storefront's coerceFeatureCards in queries.ts). */
function coerceFeatureCards(value: unknown): NoteCardFormData[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((v) => {
        if (typeof v !== "object" || v === null) return [];
        const o = v as Record<string, unknown>;
        if (typeof o.title !== "string" || typeof o.body !== "string") return [];
        return [{
            title: o.title,
            body: o.body,
            image_url: typeof o.image_url === "string" ? o.image_url : "",
        }];
    });
}

/** Serialize form rows to the persisted [{image_url?, title, body}] shape.
 *  Empty-title cards are stripped; empty image_url is omitted entirely. */
function serializeFeatureCards(cards: NoteCardFormData[]): { image_url?: string; title: string; body: string }[] {
    return cards
        .filter((c) => c.title.trim().length > 0)
        .map((c) => ({
            title: c.title.trim(),
            body: c.body,
            ...(c.image_url.trim() ? { image_url: c.image_url.trim() } : {}),
        }));
}

export interface FaqFormData {
    question: string;
    answer: string;
    display_order: number;
}

export interface TestimonialFormData {
    customer_name: string;
    customer_photo_url: string;
    rating: number;
    quote: string;
    is_featured: boolean;
    display_order: number;
}

export interface ReviewFormData {
    id?: string;
    reviewer_name: string;
    reviewer_email: string;
    rating: number;
    title: string;
    body: string;
    status: 'pending' | 'approved' | 'rejected' | 'featured';
    is_verified_purchase: boolean;
    is_manual: boolean;
    admin_response: string;
    helpful_count: number;
    created_at?: string;
}

export interface InventoryHistoryFormData {
    change_type: 'received' | 'sold' | 'returned' | 'adjusted' | 'reserved' | 'quarantined';
    quantity_change: number;
    quantity_before: number;
    quantity_after: number;
    reference_id?: string;
    notes?: string;
    changed_by?: string;
    created_at?: string;
}

export interface SupplierFormData {
    supplier_name: string;
    supplier_contact: string;
    supplier_email: string;
    lead_time_days: number | null;
    minimum_order_quantity: number | null;
    unit_cost: number | null;
    notes: string;
    is_primary: boolean;
}

export interface ActivityLogFormData {
    id?: string;
    action: 'created' | 'updated' | 'status_changed' | 'price_changed' | 'image_added' | 'variant_added' | 'variant_removed' | 'inventory_adjusted' | 'published' | 'archived';
    changes_json?: Record<string, { before: any; after: any }> | null;
    user_id?: string | null;
    created_at: string;
}

export interface PriceHistoryFormData {
    date: string;
    price: number;
    changed_by?: string;
    reason?: string;
}

export interface VariantFormData {
    id?: string;
    name: string;
    price: number;
    cost: number;
    stock_quantity: number;
    sku: string;
    option_values?: Record<string, string>;
    image_url?: string;
    is_enabled?: boolean;
}

export interface BundleItemFormData {
    child_product_id: string;
    quantity: number;
    display_order: number;
    name?: string;
    price?: number;
    image_url?: string;
}

const DEFAULT_FORM_DATA: ProductEditorFormData = {
    name: "",
    description: "",
    short_description: "",
    sku: "",
    image_url: "",
    price: 0,
    compare_at_price: 0,
    cost: 0,
    stock_quantity: 0,
    low_stock_threshold: 5,
    reorder_point: null,
    status: "draft",
    is_supply: false,
    tag_color: "#22c55e",
    barcode: "",
    cost_breakdown_json: null,
    slug: "",
    is_visible: true,
    display_order: 0,
    category_id: null,
    website_price: null,
    variant_options: [],
    variants: [],
    product_type: "physical",
    weight: null,
    dimensions_length: null,
    dimensions_width: null,
    dimensions_height: null,
    download_url: "",
    file_size: "",
    license_key_pattern: "",
    duration_minutes: null,
    booking_enabled: false,
    bundle_items: [],
    tiered_prices: [],
    order_bumps: [],
    related_products: [],
    features: [],
    faqs: [],
    testimonials: [],
    reviews: [],
    feature_cards: [],
    inventory_history: [],
    suppliers: [],
    activity_log: [],
    price_history: [],
};

/**
 * Generate all variant combinations from option groups.
 * Preserves existing variant data (price, cost, stock, SKU, image) when options change.
 */
function generateVariantCombinations(
    options: ProductOptionFormData[],
    existingVariants: VariantFormData[],
    defaultPrice: number,
    defaultCost: number
): VariantFormData[] {
    if (options.length === 0) return [];

    // Build cartesian product of option values
    const combinations: Record<string, string>[] = options.reduce<Record<string, string>[]>(
        (acc, option) => {
            if (option.values.length === 0) return acc;
            if (acc.length === 0) {
                return option.values.map(v => ({ [option.name]: v }));
            }
            const result: Record<string, string>[] = [];
            for (const existing of acc) {
                for (const value of option.values) {
                    result.push({ ...existing, [option.name]: value });
                }
            }
            return result;
        },
        []
    );

    // Map existing variants by their option_values key for data preservation
    const existingByKey = new Map<string, VariantFormData>();
    for (const v of existingVariants) {
        if (v.option_values) {
            const key = JSON.stringify(v.option_values);
            existingByKey.set(key, v);
        }
    }

    return combinations.map((combo) => {
        const key = JSON.stringify(combo);
        const existing = existingByKey.get(key);
        const name = Object.values(combo).join(" / ");

        if (existing) {
            return { ...existing, name, option_values: combo };
        }

        return {
            name,
            price: defaultPrice,
            cost: defaultCost,
            stock_quantity: 0,
            sku: "",
            option_values: combo,
            is_enabled: true,
        };
    });
}

export interface VariantDiff {
    added: VariantFormData[];
    removed: VariantFormData[];
    unchanged: VariantFormData[];
    hasStockAtRisk: boolean;
    stockAtRiskCount: number;
}

function calculateVariantDiff(
    currentVariants: VariantFormData[],
    newOptions: ProductOptionFormData[],
    defaultPrice: number,
    defaultCost: number
): VariantDiff {
    const validOptions = newOptions.filter(o => o.name.trim() && o.values.length > 0);

    if (validOptions.length === 0) {
        return {
            added: [],
            removed: currentVariants.length > 0 ? [...currentVariants] : [],
            unchanged: [],
            hasStockAtRisk: currentVariants.some(v => v.stock_quantity > 0),
            stockAtRiskCount: currentVariants.filter(v => v.stock_quantity > 0).length,
        };
    }

    // Build new combinations
    const combinations: Record<string, string>[] = validOptions.reduce<Record<string, string>[]>(
        (acc, option) => {
            if (option.values.length === 0) return acc;
            if (acc.length === 0) {
                return option.values.map(v => ({ [option.name]: v }));
            }
            const result: Record<string, string>[] = [];
            for (const existing of acc) {
                for (const value of option.values) {
                    result.push({ ...existing, [option.name]: value });
                }
            }
            return result;
        },
        []
    );

    const newKeys = new Set(combinations.map(c => JSON.stringify(c)));
    const existingByKey = new Map<string, VariantFormData>();
    for (const v of currentVariants) {
        if (v.option_values) {
            existingByKey.set(JSON.stringify(v.option_values), v);
        }
    }

    const added: VariantFormData[] = [];
    const unchanged: VariantFormData[] = [];

    for (const combo of combinations) {
        const key = JSON.stringify(combo);
        const existing = existingByKey.get(key);
        if (existing) {
            unchanged.push(existing);
        } else {
            added.push({
                name: Object.values(combo).join(" / "),
                price: defaultPrice,
                cost: defaultCost,
                stock_quantity: 0,
                sku: "",
                option_values: combo,
                is_enabled: true,
            });
        }
    }

    const removed: VariantFormData[] = [];
    for (const v of currentVariants) {
        if (v.option_values) {
            const key = JSON.stringify(v.option_values);
            if (!newKeys.has(key)) {
                removed.push(v);
            }
        }
    }

    return {
        added,
        removed,
        unchanged,
        hasStockAtRisk: removed.some(v => v.stock_quantity > 0),
        stockAtRiskCount: removed.filter(v => v.stock_quantity > 0).length,
    };
}

function productToFormData(product: Product): ProductEditorFormData {
    return {
        name: product.name,
        description: product.description || "",
        short_description: product.short_description || "",
        sku: product.sku || "",
        image_url: product.image_url || "",
        price: product.price,
        compare_at_price: product.compare_at_price || 0,
        cost: product.cost || 0,
        stock_quantity: product.stock_quantity,
        low_stock_threshold: product.low_stock_threshold,
        reorder_point: product.reorder_point ?? null,
        status: product.status || (product.is_archived ? "archived" : "active"),
        is_supply: product.is_supply,
        tag_color: product.tag_color || "#22c55e",
        barcode: product.barcode || "",
        cost_breakdown_json: product.cost_breakdown_json ?? null,
        slug: product.slug || "",
        is_visible: product.is_visible ?? true,
        display_order: product.display_order ?? 0,
        category_id: product.category_id ?? null,
        website_price: product.website_price ?? null,
        variant_options: [], // loaded separately from product_options table
        variants: (product.variants || []).map((v) => ({
            id: v.id,
            name: v.name,
            price: v.price || 0,
            cost: v.cost || 0,
            stock_quantity: v.stock_quantity,
            sku: v.sku || "",
            option_values: v.option_values || undefined,
            image_url: v.image_url || undefined,
            is_enabled: v.is_enabled ?? true,
        })),
        product_type: product.product_type || "physical",
        weight: product.weight ?? null,
        dimensions_length: product.dimensions_json?.length ?? null,
        dimensions_width: product.dimensions_json?.width ?? null,
        dimensions_height: product.dimensions_json?.height ?? null,
        download_url: product.download_url || "",
        file_size: product.file_size || "",
        license_key_pattern: product.license_key_pattern || "",
        duration_minutes: product.duration_minutes ?? null,
        booking_enabled: product.booking_enabled || false,
        bundle_items: [],
        tiered_prices: [], // loaded separately from product_tiered_pricing table
        order_bumps: [], // loaded separately from product_order_bumps table
        related_products: [], // loaded separately from product_related table
        features: [], // loaded separately from product_features table
        feature_cards: coerceFeatureCards(product.feature_cards), // jsonb column on products
        faqs: [], // loaded separately from product_faqs table
        testimonials: [], // loaded separately from product_testimonials table
        reviews: [], // loaded separately from product_reviews table
        inventory_history: [], // loaded separately from inventory_history table
        suppliers: [], // loaded separately from product_suppliers table
        activity_log: [], // loaded separately from product_activity_log table
        price_history: [], // loaded separately from product_price_history table
    };
}

interface UseProductEditorOptions {
    product?: Product | null; // null for new product mode
    mode: "create" | "edit";
}

export function useProductEditor({ product, mode }: UseProductEditorOptions) {
    const router = useRouter();
    const { addProduct, updateProduct, addVariant, updateVariant, deleteVariant } = useProductsCrud();
    const { tenantId } = useAuth();

    const initialData = useMemo(() =>
        product ? productToFormData(product) : DEFAULT_FORM_DATA,
        [product]
    );

    const [formData, setFormData] = useState<ProductEditorFormData>(initialData);
    const [saving, setSaving] = useState(false);
    const initialDataRef = useRef(initialData);

    // Reset form only when navigating to a different product — NOT on every
    // refetch. TanStack invalidation returns a new `products` array reference
    // on each settled mutation; depending on `product` (object identity) would
    // wipe in-flight user edits and reset `initialDataRef`, making isDirty go
    // false after the first successful save.
    useEffect(() => {
        const newData = product ? productToFormData(product) : DEFAULT_FORM_DATA;
        setFormData(newData);
        initialDataRef.current = newData;
    }, [product?.id]);

    const [pendingVariantDiff, setPendingVariantDiff] = useState<VariantDiff | null>(null);
    const [pendingOptions, setPendingOptions] = useState<ProductOptionFormData[] | null>(null);
    const [previousOptions, setPreviousOptions] = useState<ProductOptionFormData[] | null>(null);

    // Load related data from separate tables when editing
    const [relatedDataLoaded, setRelatedDataLoaded] = useState(false);
    useEffect(() => {
        if (!product?.id || mode !== "edit") return;
        let cancelled = false;

        async function loadRelatedData() {
            try {
                const [
                    options,
                    tieredPrices,
                    orderBumps,
                    relatedProducts,
                    features,
                    faqs,
                    testimonials,
                    reviews,
                    inventoryHistory,
                    suppliers,
                    activityLog,
                    priceHistory,
                    bundleItems,
                ] = await Promise.all([
                    productRepository.getProductOptions(product!.id),
                    productRepository.getTieredPrices(product!.id),
                    productRepository.getOrderBumps(product!.id),
                    productRepository.getRelatedProducts(product!.id),
                    productRepository.getFeatures(product!.id),
                    productRepository.getFaqs(product!.id),
                    productRepository.getTestimonials(product!.id),
                    productRepository.getReviews(product!.id),
                    productRepository.getInventoryHistory(product!.id),
                    productRepository.getSuppliers(product!.id),
                    productRepository.getActivityLog(product!.id),
                    productRepository.getPriceHistory(product!.id),
                    productRepository.getBundleItems(product!.id),
                ]);

                if (cancelled) return;

                const relatedUpdates: Partial<ProductEditorFormData> = {
                    variant_options: options.map((o: any) => ({
                        id: o.id,
                        name: o.name,
                        values: o.values || [],
                        option_type: o.option_type || 'custom',
                        values_metadata: o.values_metadata || null,
                    })),
                    tiered_prices: tieredPrices.map((t: any) => ({
                        min_quantity: t.min_quantity,
                        max_quantity: t.max_quantity,
                        price: t.price,
                    })),
                    order_bumps: orderBumps.map((b: any) => ({
                        bump_product_id: b.bump_product_id,
                        discount_percentage: b.discount_percentage,
                        headline: b.headline || "",
                        description: b.description || "",
                        display_order: b.display_order,
                        is_active: b.is_active,
                    })),
                    related_products: relatedProducts.map((r: any) => ({
                        related_product_id: r.related_product_id,
                        relation_type: r.relation_type,
                        display_order: r.display_order,
                    })),
                    features: features.map((f: any) => ({
                        icon: f.icon || "Sparkles",
                        title: f.title,
                        description: f.description || "",
                        display_order: f.display_order,
                    })),
                    faqs: faqs.map((f: any) => ({
                        question: f.question,
                        answer: f.answer,
                        display_order: f.display_order,
                    })),
                    testimonials: testimonials.map((t: any) => ({
                        customer_name: t.customer_name,
                        customer_photo_url: t.customer_photo_url || "",
                        rating: t.rating,
                        quote: t.quote,
                        is_featured: t.is_featured,
                        display_order: t.display_order,
                    })),
                    reviews: reviews.map((r: any) => ({
                        id: r.id,
                        reviewer_name: r.reviewer_name,
                        reviewer_email: r.reviewer_email || "",
                        rating: r.rating,
                        title: r.title || "",
                        body: r.body || "",
                        status: r.status,
                        is_verified_purchase: r.is_verified_purchase,
                        is_manual: r.is_manual,
                        admin_response: r.admin_response || "",
                        helpful_count: r.helpful_count || 0,
                        created_at: r.created_at,
                    })),
                    inventory_history: inventoryHistory.map((h: any) => ({
                        change_type: h.change_type,
                        quantity_change: h.quantity_change,
                        quantity_before: h.quantity_before,
                        quantity_after: h.quantity_after,
                        reference_id: h.reference_id,
                        notes: h.notes,
                        changed_by: h.changed_by,
                        created_at: h.created_at,
                    })),
                    suppliers: suppliers.map((s: any) => ({
                        supplier_name: s.supplier_name,
                        supplier_contact: s.supplier_contact || "",
                        supplier_email: s.supplier_email || "",
                        lead_time_days: s.lead_time_days,
                        minimum_order_quantity: s.minimum_order_quantity,
                        unit_cost: s.unit_cost,
                        notes: s.notes || "",
                        is_primary: s.is_primary,
                    })),
                    activity_log: activityLog.map((a: any) => ({
                        id: a.id,
                        action: a.action,
                        changes_json: a.changes_json,
                        user_id: a.user_id,
                        created_at: a.created_at,
                    })),
                    price_history: priceHistory.map((p: any) => ({
                        date: p.created_at,
                        price: Number(p.new_price),
                        changed_by: p.changed_by,
                        reason: p.reason,
                    })),
                    bundle_items: bundleItems.map((b: any) => ({
                        child_product_id: b.child_product_id,
                        quantity: b.quantity,
                        display_order: b.display_order,
                    })),
                };

                // Baseline for dirty detection is server-loaded data + related
                // rows. Don't derive it from `prev` — `prev` may contain the
                // user's in-flight edits, which would incorrectly mark the form
                // clean.
                const serverBaseline = product
                    ? { ...productToFormData(product), ...relatedUpdates }
                    : { ...DEFAULT_FORM_DATA, ...relatedUpdates };
                initialDataRef.current = serverBaseline as ProductEditorFormData;
                setFormData((prev) => ({ ...prev, ...relatedUpdates }));
                setRelatedDataLoaded(true);
            } catch (error) {
                console.error("Error loading related product data:", error);
            }
        }

        loadRelatedData();
        return () => { cancelled = true; };
    }, [product?.id, mode]);

    // Auto-save
    const autoSaveKey = mode === "create"
        ? "product-editor-new"
        : `product-editor-${product?.id}`;

    const { hasDraft, restoreDraft, clearDraft } = useAutoSave({
        key: autoSaveKey,
        data: formData,
        enabled: true,
    });

    // Dirty detection
    const isDirty = useMemo(() => {
        return JSON.stringify(formData) !== JSON.stringify(initialDataRef.current);
    }, [formData]);

    // Navigation guard
    useEffect(() => {
        if (!isDirty) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isDirty]);

    // Update a single field
    const updateField = useCallback(<K extends keyof ProductEditorFormData>(
        field: K,
        value: ProductEditorFormData[K]
    ) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    }, []);

    // Update multiple fields at once
    const updateFields = useCallback((updates: Partial<ProductEditorFormData>) => {
        setFormData((prev) => ({ ...prev, ...updates }));
    }, []);

    // Slug generation — uses the shared Unicode-aware slugify so Arabic /
    // Kurdish product names produce a real slug instead of an empty string.
    const autoGenerateSlug = useCallback(() => {
        if (formData.name) {
            setFormData((prev) => ({ ...prev, slug: slugify(formData.name) }));
        }
    }, [formData.name]);

    // Profit calculations
    const profitMargin = useMemo(() => {
        if (formData.cost > 0 && formData.price > 0) {
            return ((formData.price - formData.cost) / formData.price) * 100;
        }
        return null;
    }, [formData.price, formData.cost]);

    const profitAmount = useMemo(() => {
        if (formData.cost > 0) {
            return formData.price - formData.cost;
        }
        return null;
    }, [formData.price, formData.cost]);

    const discountPercentage = useMemo(() => {
        if (formData.compare_at_price > formData.price && formData.compare_at_price > 0) {
            return Math.round((1 - formData.price / formData.compare_at_price) * 100);
        }
        return null;
    }, [formData.price, formData.compare_at_price]);

    // Variant management
    const addVariantToForm = useCallback(() => {
        setFormData((prev) => ({
            ...prev,
            variants: [
                ...prev.variants,
                { name: "", price: prev.price, cost: prev.cost, stock_quantity: 0, sku: "" },
            ],
        }));
    }, []);

    const removeVariantFromForm = useCallback((index: number) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.filter((_, i) => i !== index),
        }));
    }, []);

    const updateVariantInForm = useCallback((index: number, field: keyof VariantFormData, value: string | number) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((v, i) =>
                i === index ? { ...v, [field]: value } : v
            ),
        }));
    }, []);

    // Advanced variant option management
    const updateVariantOptions = useCallback((options: ProductOptionFormData[]) => {
        setFormData((prev) => {
            const validOptions = options.filter(o => o.name.trim() && o.values.length > 0);

            // If no current variants or all options cleared, apply directly
            if (prev.variants.length === 0 || validOptions.length === 0) {
                const newVariants = generateVariantCombinations(validOptions, prev.variants, prev.price, prev.cost);
                return { ...prev, variant_options: options, variants: newVariants };
            }

            // Calculate diff
            const diff = calculateVariantDiff(prev.variants, options, prev.price, prev.cost);

            // If nothing is being removed, apply directly
            if (diff.removed.length === 0) {
                const newVariants = generateVariantCombinations(validOptions, prev.variants, prev.price, prev.cost);
                return { ...prev, variant_options: options, variants: newVariants };
            }

            // Store diff for confirmation — don't update variants yet, only update options visually
            setPendingVariantDiff(diff);
            setPreviousOptions(prev.variant_options);
            setPendingOptions(options);
            return { ...prev, variant_options: options };
        });
    }, []);

    const updateVariantRow = useCallback((index: number, updates: Partial<VariantFormData>) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((v, i) =>
                i === index ? { ...v, ...updates } : v
            ),
        }));
    }, []);

    const applyToAllVariants = useCallback((field: 'price' | 'cost' | 'stock_quantity', value: number) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((v) => ({ ...v, [field]: value })),
        }));
    }, []);

    const confirmVariantChanges = useCallback(() => {
        if (!pendingOptions) return;
        setFormData((prev) => {
            const validOptions = pendingOptions.filter(o => o.name.trim() && o.values.length > 0);
            const newVariants = generateVariantCombinations(validOptions, prev.variants, prev.price, prev.cost);
            return { ...prev, variant_options: pendingOptions, variants: newVariants };
        });
        setPendingVariantDiff(null);
        setPendingOptions(null);
        setPreviousOptions(null);
    }, [pendingOptions]);

    const cancelVariantChanges = useCallback(() => {
        if (!previousOptions) return;
        // Revert options to what they were before the pending change
        setFormData((prev) => ({
            ...prev,
            variant_options: previousOptions,
        }));
        setPendingVariantDiff(null);
        setPendingOptions(null);
        setPreviousOptions(null);
    }, [previousOptions]);

    const dismissVariantDiff = useCallback(() => {
        setPendingVariantDiff(null);
        setPendingOptions(null);
    }, []);

    const bulkUpdateVariants = useCallback((indices: number[], updates: Partial<VariantFormData>) => {
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.map((v, i) =>
                indices.includes(i) ? { ...v, ...updates } : v
            ),
        }));
    }, []);

    const deleteVariants = useCallback((indices: number[]) => {
        const indexSet = new Set(indices);
        setFormData((prev) => ({
            ...prev,
            variants: prev.variants.filter((_, i) => !indexSet.has(i)),
        }));
    }, []);

    // Discard changes
    const discard = useCallback(() => {
        setFormData(initialDataRef.current);
        clearDraft();
    }, [clearDraft]);

    // Restore draft
    const handleRestoreDraft = useCallback(() => {
        const draft = restoreDraft();
        if (draft) {
            setFormData(draft);
            toast.success("Draft restored");
        }
    }, [restoreDraft]);

    const dismissDraft = useCallback(() => {
        clearDraft();
    }, [clearDraft]);

    // Save related data to all subsidiary tables
    const saveRelatedData = useCallback(async (productId: string) => {
        const validOptions = formData.variant_options.filter(o => o.name.trim() && o.values.length > 0);
        await Promise.all([
            productRepository.saveProductOptions(productId, validOptions.map((o, i) => ({
                name: o.name,
                values: o.values,
                display_order: i,
                option_type: o.option_type || 'custom',
                values_metadata: o.values_metadata || null,
            })), tenantId),
            productRepository.saveTieredPrices(productId, formData.tiered_prices, tenantId),
            productRepository.saveOrderBumps(productId, formData.order_bumps.map((b) => ({
                bump_product_id: b.bump_product_id,
                discount_percentage: b.discount_percentage,
                headline: b.headline,
                description: b.description,
                display_order: b.display_order,
                is_active: b.is_active,
            })), tenantId),
            productRepository.saveRelatedProducts(productId, formData.related_products.map((r) => ({
                related_product_id: r.related_product_id,
                relation_type: r.relation_type,
                display_order: r.display_order,
            })), tenantId),
            productRepository.saveFeatures(productId, formData.features, tenantId),
            productRepository.saveFaqs(productId, formData.faqs, tenantId),
            productRepository.saveTestimonials(productId, formData.testimonials.map((t) => ({
                customer_name: t.customer_name,
                customer_photo_url: t.customer_photo_url || null,
                rating: t.rating,
                quote: t.quote,
                is_featured: t.is_featured,
                display_order: t.display_order,
            })), tenantId),
            productRepository.saveReviews(productId, formData.reviews.map((r) => ({
                reviewer_name: r.reviewer_name,
                reviewer_email: r.reviewer_email,
                rating: r.rating,
                title: r.title,
                body: r.body,
                status: r.status,
                is_verified_purchase: r.is_verified_purchase,
                is_manual: r.is_manual,
                admin_response: r.admin_response || null,
                helpful_count: r.helpful_count,
            })), tenantId),
            productRepository.saveSuppliers(productId, formData.suppliers.map((s) => ({
                supplier_name: s.supplier_name,
                supplier_contact: s.supplier_contact || undefined,
                supplier_email: s.supplier_email || undefined,
                lead_time_days: s.lead_time_days,
                minimum_order_quantity: s.minimum_order_quantity,
                unit_cost: s.unit_cost,
                notes: s.notes || undefined,
                is_primary: s.is_primary,
            })), tenantId),
            productRepository.saveBundleItems(productId, formData.bundle_items.map((b) => ({
                child_product_id: b.child_product_id,
                quantity: b.quantity,
                display_order: b.display_order,
            })), tenantId),
        ]);
    }, [formData, tenantId]);

    // Save
    const save = useCallback(async () => {
        if (!formData.name.trim()) {
            toast.error("Product name is required");
            return false;
        }
        if (!formData.is_supply && formData.price <= 0) {
            toast.error("Price must be greater than 0");
            return false;
        }

        // Validate SKU uniqueness format (no spaces)
        if (formData.sku && /\s/.test(formData.sku)) {
            toast.error("SKU cannot contain spaces");
            return false;
        }

        // Validate slug format
        if (formData.slug && !/^[a-z0-9-]+$/.test(formData.slug)) {
            toast.error("URL slug can only contain lowercase letters, numbers, and hyphens");
            return false;
        }

        // Validate digital product fields
        if (formData.product_type === "digital") {
            if (!formData.download_url && !formData.file_size) {
                // Soft warning, not blocking
            }
        }

        // Validate tiered pricing (no overlapping ranges)
        if (formData.tiered_prices.length > 1) {
            const sorted = [...formData.tiered_prices].sort((a, b) => a.min_quantity - b.min_quantity);
            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const curr = sorted[i];
                if (prev.max_quantity !== null && curr.min_quantity <= prev.max_quantity) {
                    toast.error("Tiered pricing has overlapping quantity ranges");
                    return false;
                }
            }
        }

        // Validate bundle has items
        if (formData.product_type === "bundle" && formData.bundle_items.length === 0) {
            toast.error("Bundle products must contain at least one item");
            return false;
        }

        // Validate cost is not greater than price (warning only for negative margin)
        if (formData.cost > 0 && formData.cost > formData.price && !formData.is_supply) {
            // Allow but warn
            toast.warning("Cost exceeds price — this product has negative margin");
        }

        setSaving(true);
        try {
            if (mode === "create") {
                const newProduct = await addProduct({
                    name: formData.name,
                    description: formData.description,
                    sku: formData.sku || undefined,
                    price: formData.price,
                    compare_at_price: formData.compare_at_price || undefined,
                    cost: formData.cost,
                    stock_quantity: formData.stock_quantity,
                    low_stock_threshold: formData.low_stock_threshold,
                    reorder_point: formData.reorder_point,
                    image_url: formData.image_url,
                    tag_color: formData.tag_color,
                    barcode: formData.barcode || undefined,
                    cost_breakdown_json: formData.cost_breakdown_json,
                    is_supply: formData.is_supply,
                    slug: formData.slug || undefined,
                    is_visible: formData.is_visible,
                    display_order: formData.display_order,
                    category_id: formData.category_id,
                    website_price: formData.website_price,
                    short_description: formData.short_description || undefined,
                    status: formData.status,
                    product_type: formData.product_type,
                    weight: formData.weight,
                    dimensions_json: (formData.dimensions_length || formData.dimensions_width || formData.dimensions_height)
                        ? { length: formData.dimensions_length, width: formData.dimensions_width, height: formData.dimensions_height }
                        : null,
                    download_url: formData.download_url || undefined,
                    file_size: formData.file_size || undefined,
                    license_key_pattern: formData.license_key_pattern || undefined,
                    duration_minutes: formData.duration_minutes,
                    booking_enabled: formData.booking_enabled,
                    feature_cards: serializeFeatureCards(formData.feature_cards),
                } as any);

                if (newProduct) {
                    // Add variants
                    if (formData.variants.length > 0) {
                        for (const variant of formData.variants) {
                            await addVariant(newProduct.id, {
                                name: variant.name,
                                price: variant.price,
                                cost: variant.cost,
                                stock_quantity: variant.stock_quantity,
                                sku: variant.sku,
                                option_values: variant.option_values,
                                image_url: variant.image_url,
                                is_enabled: variant.is_enabled ?? true,
                            } as any);
                        }
                    }

                    // Save all related data
                    await saveRelatedData(newProduct.id);

                    // Log creation
                    await productRepository.addActivityLogEntry(newProduct.id, {
                        action: "created",
                    }, tenantId);

                    // Log initial price
                    if (formData.price > 0) {
                        await productRepository.addPriceHistoryEntry(newProduct.id, {
                            new_price: formData.price,
                            reason: "Initial price",
                        }, tenantId);
                    }
                }

                clearDraft();
                toast.success("Product created successfully");
                if (newProduct) {
                    router.push(`/products/${newProduct.id}/edit`);
                }
            } else if (product) {
                await updateProduct(product.id, {
                    name: formData.name,
                    description: formData.description,
                    sku: formData.sku || undefined,
                    price: formData.price,
                    compare_at_price: formData.compare_at_price || undefined,
                    cost: formData.cost,
                    stock_quantity: formData.stock_quantity,
                    low_stock_threshold: formData.low_stock_threshold,
                    reorder_point: formData.reorder_point,
                    image_url: formData.image_url,
                    tag_color: formData.tag_color,
                    barcode: formData.barcode || undefined,
                    cost_breakdown_json: formData.cost_breakdown_json,
                    is_supply: formData.is_supply,
                    slug: formData.slug || undefined,
                    is_visible: formData.is_visible,
                    display_order: formData.display_order,
                    category_id: formData.category_id,
                    website_price: formData.website_price,
                    short_description: formData.short_description || undefined,
                    status: formData.status,
                    product_type: formData.product_type,
                    weight: formData.weight,
                    dimensions_json: (formData.dimensions_length || formData.dimensions_width || formData.dimensions_height)
                        ? { length: formData.dimensions_length, width: formData.dimensions_width, height: formData.dimensions_height }
                        : null,
                    download_url: formData.download_url || undefined,
                    file_size: formData.file_size || undefined,
                    license_key_pattern: formData.license_key_pattern || undefined,
                    duration_minutes: formData.duration_minutes,
                    booking_enabled: formData.booking_enabled,
                    feature_cards: serializeFeatureCards(formData.feature_cards),
                } as any);

                // Handle variants
                const existingVariantIds = new Set(
                    (product.variants || []).map((v) => v.id)
                );

                for (const variant of formData.variants) {
                    if (variant.id && existingVariantIds.has(variant.id)) {
                        await updateVariant(variant.id, {
                            name: variant.name,
                            price: variant.price,
                            cost: variant.cost,
                            stock_quantity: variant.stock_quantity,
                            sku: variant.sku,
                            option_values: variant.option_values,
                            image_url: variant.image_url,
                            is_enabled: variant.is_enabled ?? true,
                        } as any);
                        existingVariantIds.delete(variant.id);
                    } else {
                        await addVariant(product.id, {
                            name: variant.name,
                            price: variant.price,
                            cost: variant.cost,
                            stock_quantity: variant.stock_quantity,
                            sku: variant.sku,
                            option_values: variant.option_values,
                            image_url: variant.image_url,
                            is_enabled: variant.is_enabled ?? true,
                        } as any);
                    }
                }

                // Delete removed variants
                for (const removedId of existingVariantIds) {
                    await deleteVariant(removedId);
                }

                // Save all related data
                await saveRelatedData(product.id);

                // Track changes for activity log
                const changes: Record<string, { before: any; after: any }> = {};
                const prev = initialDataRef.current;
                if (prev.name !== formData.name) changes.name = { before: prev.name, after: formData.name };
                if (prev.price !== formData.price) changes.price = { before: prev.price, after: formData.price };
                if (prev.status !== formData.status) changes.status = { before: prev.status, after: formData.status };
                if (prev.stock_quantity !== formData.stock_quantity) changes.stock_quantity = { before: prev.stock_quantity, after: formData.stock_quantity };
                if (prev.is_visible !== formData.is_visible) changes.is_visible = { before: prev.is_visible, after: formData.is_visible };
                if (prev.image_url !== formData.image_url) changes.image_url = { before: prev.image_url, after: formData.image_url };

                // Determine action type
                let action: string = "updated";
                if (prev.status !== formData.status) action = "status_changed";
                else if (prev.price !== formData.price) action = "price_changed";
                else if (prev.image_url !== formData.image_url && formData.image_url) action = "image_added";
                else if (prev.stock_quantity !== formData.stock_quantity) action = "inventory_adjusted";

                if (Object.keys(changes).length > 0) {
                    await productRepository.addActivityLogEntry(product.id, {
                        action,
                        changes_json: changes,
                    }, tenantId);
                }

                // Track price changes
                if (prev.price !== formData.price) {
                    await productRepository.addPriceHistoryEntry(product.id, {
                        old_price: prev.price,
                        new_price: formData.price,
                        reason: "Manual price update",
                    }, tenantId);
                }

                // Auto-capture inventory changes
                if (prev.stock_quantity !== formData.stock_quantity) {
                    await productRepository.addInventoryEntry(product.id, {
                        change_type: "adjusted",
                        quantity_change: formData.stock_quantity - prev.stock_quantity,
                        quantity_before: prev.stock_quantity,
                        quantity_after: formData.stock_quantity,
                        notes: "Manual stock adjustment via product editor",
                    }, tenantId);
                }

                clearDraft();
                // Update initial data ref to new saved state
                initialDataRef.current = { ...formData };
                toast.success("Product updated successfully");
            }

            return true;
        } catch (error) {
            console.error("Error saving product:", error);
            toast.error("Failed to save product");
            return false;
        } finally {
            setSaving(false);
        }
    }, [formData, mode, product, addProduct, updateProduct, addVariant, updateVariant, deleteVariant, clearDraft, router, saveRelatedData, tenantId]);

    // Duplicate product
    const duplicateProduct = useCallback(async () => {
        if (!product) return;
        setSaving(true);
        try {
            const newProduct = await addProduct({
                name: `Copy of ${formData.name}`,
                description: formData.description,
                sku: formData.sku ? `${formData.sku}-copy` : undefined,
                price: formData.price,
                compare_at_price: formData.compare_at_price || undefined,
                cost: formData.cost,
                stock_quantity: 0,
                low_stock_threshold: formData.low_stock_threshold,
                reorder_point: formData.reorder_point,
                image_url: formData.image_url,
                tag_color: formData.tag_color,
                is_supply: formData.is_supply,
                slug: formData.slug ? `${formData.slug}-copy` : undefined,
                is_visible: false,
                display_order: formData.display_order,
                category_id: formData.category_id,
                website_price: formData.website_price,
                short_description: formData.short_description || undefined,
                status: "draft" as const,
                product_type: formData.product_type,
                weight: formData.weight,
                dimensions_json: (formData.dimensions_length || formData.dimensions_width || formData.dimensions_height)
                    ? { length: formData.dimensions_length, width: formData.dimensions_width, height: formData.dimensions_height }
                    : null,
                download_url: formData.download_url || undefined,
                file_size: formData.file_size || undefined,
                license_key_pattern: formData.license_key_pattern || undefined,
                duration_minutes: formData.duration_minutes,
                booking_enabled: formData.booking_enabled,
                feature_cards: serializeFeatureCards(formData.feature_cards),
            } as any);

            if (newProduct && formData.variants.length > 0) {
                for (const variant of formData.variants) {
                    await addVariant(newProduct.id, {
                        name: variant.name,
                        price: variant.price,
                        cost: variant.cost,
                        stock_quantity: 0,
                        sku: variant.sku ? `${variant.sku}-copy` : "",
                        option_values: variant.option_values,
                        image_url: variant.image_url,
                        is_enabled: variant.is_enabled ?? true,
                    } as any);
                }
            }

            // Copy related data to the duplicate
            if (newProduct) {
                await saveRelatedData(newProduct.id);
                await productRepository.addActivityLogEntry(newProduct.id, {
                    action: "created",
                    changes_json: { source: { before: null, after: `Duplicated from ${product.id}` } },
                }, tenantId);
            }

            toast.success("Product duplicated successfully");
            if (newProduct) {
                router.push(`/products/${newProduct.id}/edit`);
            }
        } catch (error) {
            console.error("Error duplicating product:", error);
            toast.error("Failed to duplicate product");
        } finally {
            setSaving(false);
        }
    }, [formData, product, addProduct, addVariant, router, saveRelatedData, tenantId]);

    return {
        formData,
        setFormData,
        updateField,
        updateFields,

        // Status
        isDirty,
        saving,
        mode,

        // Actions
        save,
        discard,
        autoGenerateSlug,

        // Variants (basic)
        addVariantToForm,
        removeVariantFromForm,
        updateVariantInForm,

        // Variants (advanced options)
        updateVariantOptions,
        updateVariantRow,
        applyToAllVariants,
        bulkUpdateVariants,
        deleteVariants,

        // Variant diff/confirmation
        pendingVariantDiff,
        confirmVariantChanges,
        cancelVariantChanges,
        dismissVariantDiff,

        // Calculations
        profitMargin,
        profitAmount,
        discountPercentage,

        // Draft
        hasDraft,
        handleRestoreDraft,
        dismissDraft,

        // Duplicate
        duplicateProduct,
    };
}
