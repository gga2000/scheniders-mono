"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import type { Product, ProductVariant, VariantOptionType, OptionValueMetadata, CostBreakdown } from "@/types/product";
import { isCanonicalSlug, slugify } from "@scheniders/shared";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useAutoSave } from "@/hooks/use-auto-save";
import { productRepository } from "@/lib/repositories/product-repository";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { productWriteErrorKey } from "@/lib/product-write-error";
import { usePermission } from "@/hooks/use-permission";
import { uniqueCopyValue } from "@/lib/unique-copy-value";
import { PERMISSIONS } from "@/lib/permissions";

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
    short_name: string;
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
    is_filler: boolean;
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

export interface InventoryHistoryFormData {
    change_type: 'received' | 'sold' | 'returned' | 'adjusted' | 'reserved' | 'quarantined' | 'count' | 'open_box_count';
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
    short_name: "",
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
    is_filler: false,
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
        short_name: product.short_name || "",
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
        is_filler: product.is_filler ?? false,
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
        feature_cards: coerceFeatureCards(product.feature_cards), // jsonb column on products
        inventory_history: [], // loaded separately from inventory_history table
        suppliers: [], // loaded separately from product_suppliers table
        activity_log: [], // loaded separately from product_activity_log table
        price_history: [], // loaded separately from product_price_history table
    };
}

/**
 * website_price is the storefront's override of price. Empty, 0 or the same
 * as price means "sell at price" and is stored as null, so a later price
 * change reaches the store instead of leaving a stale copy behind.
 */
function storeOverride(websitePrice: number | null, price: number): number | null {
    return websitePrice && websitePrice > 0 && websitePrice !== price ? websitePrice : null;
}

interface UseProductEditorOptions {
    product?: Product | null; // null for new product mode
    mode: "create" | "edit";
    defaultIsSupply?: boolean;
}

export function useProductEditor({ product, mode, defaultIsSupply = false }: UseProductEditorOptions) {
    const router = useRouter();
    const { products: catalogue, addProduct, updateProduct, addVariant, updateVariant, deleteVariant } = useProductsCrud();
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const { can } = usePermission();
    // Cost is readable only by admins (product_costs, migration
    // 20261031004000), plus a supply's own cost, which is its price. Anyone
    // else loaded no cost, so their saves leave cost untouched instead of
    // writing back the empty value.
    const showCost = can(PERMISSIONS.MANAGE_PRODUCTS) || can(PERMISSIONS.VIEW_FINANCIALS)
        || mode === "create" || !!product?.is_supply;
    // Supplier rows carry unit cost, so save_product_children refuses them from
    // a caller who cannot read cost, even as an empty list. Create mode shows
    // the cost field (the row's own cost is writable) but not this section.
    const canEditSuppliers = can(PERMISSIONS.MANAGE_PRODUCTS) || can(PERMISSIONS.VIEW_FINANCIALS)
        || !!product?.is_supply;

    const emptyForm = useMemo(
        () => (defaultIsSupply ? { ...DEFAULT_FORM_DATA, is_supply: true } : DEFAULT_FORM_DATA),
        [defaultIsSupply]
    );
    const initialData = useMemo(() =>
        product ? productToFormData(product) : emptyForm,
        [product, emptyForm]
    );

    const [formData, setFormData] = useState<ProductEditorFormData>(initialData);
    const [saving, setSaving] = useState(false);
    const initialDataRef = useRef(initialData);
    // The product's updated_at when this editor loaded it (then after each of
    // its own saves). A save only applies if the row still carries it.
    const baseUpdatedAtRef = useRef<string | null>(product?.updated_at ?? null);

    // Reset form only when navigating to a different product — NOT on every
    // refetch. TanStack invalidation returns a new `products` array reference
    // on each settled mutation; depending on `product` (object identity) would
    // wipe in-flight user edits and reset `initialDataRef`, making isDirty go
    // false after the first successful save.
    useEffect(() => {
        const newData = product ? productToFormData(product) : emptyForm;
        setFormData(newData);
        initialDataRef.current = newData;
        baseUpdatedAtRef.current = product?.updated_at ?? null;
    }, [product?.id, emptyForm]);

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
                if (!cancelled) toast.error(t("products.ed.err.relatedLoad"));
            }
        }

        loadRelatedData();
        return () => { cancelled = true; };
    }, [product?.id, mode, t]);

    // Auto-save
    const autoSaveKey = mode === "create"
        ? "product-editor-new"
        : `product-editor-${product?.id}`;

    // Dirty detection
    const isDirty = useMemo(() => {
        return JSON.stringify(formData) !== JSON.stringify(initialDataRef.current);
    }, [formData]);

    // Only unsaved edits are kept as a draft, tied to the product version they
    // were made on, so an old draft can never be offered over newer changes.
    const { hasDraft, restoreDraft, clearDraft } = useAutoSave({
        key: autoSaveKey,
        data: formData,
        enabled: isDirty,
        version: product?.updated_at ?? null,
    });

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
            // Stock is never restored: it moves with every order, and the
            // editor saves a changed stock as a shelf count. The draft's
            // number would overwrite today's stock.
            const loaded = initialDataRef.current;
            const loadedVariantStock = new Map(loaded.variants.flatMap((v) => (v.id ? [[v.id, v.stock_quantity] as const] : [])));
            setFormData({
                ...draft,
                stock_quantity: loaded.stock_quantity,
                variants: draft.variants.map((v) =>
                    v.id && loadedVariantStock.has(v.id) ? { ...v, stock_quantity: loadedVariantStock.get(v.id) ?? 0 } : v,
                ),
            });
            toast.success(t("products.ed.draftRestored"));
        }
    }, [restoreDraft, t]);

    const dismissDraft = useCallback(() => {
        clearDraft();
    }, [clearDraft]);

    // Save related data to all subsidiary tables
    const saveRelatedData = useCallback(async (productId: string) => {
        const validOptions = formData.variant_options.filter(o => o.name.trim() && o.values.length > 0);
        // One call, one transaction: a failure leaves every table as it was.
        await productRepository.saveChildren(productId, {
            product_options: validOptions.map((o, i) => ({
                name: o.name,
                values: o.values,
                display_order: i,
                option_type: o.option_type || 'custom',
                values_metadata: o.values_metadata || null,
            })),
            product_tiered_pricing: formData.tiered_prices.map((tp) => ({
                min_quantity: tp.min_quantity,
                max_quantity: tp.max_quantity,
                price: tp.price,
            })),
            product_order_bumps: formData.order_bumps.map((b) => ({
                bump_product_id: b.bump_product_id,
                discount_percentage: b.discount_percentage,
                headline: b.headline,
                description: b.description,
                display_order: b.display_order,
                is_active: b.is_active,
            })),
            product_related: formData.related_products.map((r) => ({
                related_product_id: r.related_product_id,
                relation_type: r.relation_type,
                display_order: r.display_order,
            })),
            ...(canEditSuppliers && { product_suppliers: formData.suppliers.map((s) => ({
                supplier_name: s.supplier_name,
                supplier_contact: s.supplier_contact || undefined,
                supplier_email: s.supplier_email || undefined,
                lead_time_days: s.lead_time_days,
                minimum_order_quantity: s.minimum_order_quantity,
                unit_cost: s.unit_cost,
                notes: s.notes || undefined,
                is_primary: s.is_primary,
            })) }),
            product_bundle_items: formData.bundle_items.map((b) => ({
                child_product_id: b.child_product_id,
                quantity: b.quantity,
                display_order: b.display_order,
            })),
        });
    }, [formData, canEditSuppliers]);

    // Save
    const save = useCallback(async () => {
        if (mode === "edit" && !relatedDataLoaded) {
            // Saving before the tiers, bumps and options arrive would replace
            // them with empty lists.
            toast.error(t("products.ed.err.relatedNotLoaded"));
            return false;
        }
        if (!formData.name.trim()) {
            toast.error(t("products.ed.err.name"));
            return false;
        }
        if (!formData.is_supply && formData.price <= 0) {
            toast.error(t("products.ed.err.price"));
            return false;
        }

        // Validate SKU uniqueness format (no spaces)
        if (formData.sku && /\s/.test(formData.sku)) {
            toast.error(t("products.ed.err.sku"));
            return false;
        }

        // Validate slug format. Checked against slugify rather than an ASCII
        // pattern: slugify is Unicode-aware by design for this market, so an
        // ASCII-only rule rejected the Arabic slugs the system itself had
        // generated (رفقات, ويفر, بستاشيو…) and blocked every save on those
        // products — including edits that never touched the slug.
        if (formData.slug && !isCanonicalSlug(formData.slug)) {
            toast.error(t("products.ed.err.slug"));
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
                    toast.error(t("products.ed.err.tiers"));
                    return false;
                }
            }
        }

        // A tier is a break for buying 2 or more at a price above 0 and below
        // the product price. Checkout charges the lower of the two, so a
        // 1-or-more tier would freeze the price and a 0 tier would sell free.
        if (formData.tiered_prices.some((tp) =>
            tp.min_quantity < 2 || tp.price <= 0 || tp.price >= formData.price
        )) {
            toast.error(t("products.ed.err.tierPrice"));
            return false;
        }

        // Validate bundle has items
        if (formData.product_type === "bundle" && formData.bundle_items.length === 0) {
            toast.error(t("products.ed.err.bundle"));
            return false;
        }

        // Validate cost is not greater than price (warning only for negative margin)
        if (formData.cost > 0 && formData.cost > formData.price && !formData.is_supply) {
            // Allow but warn
            toast.warning(t("products.ed.warn.margin"));
        }

        setSaving(true);
        try {
            if (mode === "create") {
                const newProduct = await addProduct({
                    name: formData.name,
                    short_name: formData.short_name.trim() || null,
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
                    is_filler: formData.is_filler,
                    slug: formData.slug || undefined,
                    is_visible: formData.is_visible,
                    display_order: formData.display_order,
                    category_id: formData.category_id,
                    website_price: storeOverride(formData.website_price, formData.price),
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
                toast.success(t("products.created"));
                if (newProduct) {
                    router.push(`/products/${newProduct.id}/edit`);
                }
            } else if (product) {
                const savedUpdatedAt = await updateProduct(product.id, {
                    name: formData.name,
                    short_name: formData.short_name.trim() || null,
                    description: formData.description,
                    // Cleared fields are saved as cleared (null), not skipped.
                    sku: formData.sku.trim() || null,
                    price: formData.price,
                    compare_at_price: formData.compare_at_price || null,
                    ...(showCost && { cost: formData.cost, cost_breakdown_json: formData.cost_breakdown_json }),
                    low_stock_threshold: formData.low_stock_threshold,
                    reorder_point: formData.reorder_point,
                    image_url: formData.image_url,
                    tag_color: formData.tag_color,
                    barcode: formData.barcode.trim() || null,
                    is_supply: formData.is_supply,
                    is_filler: formData.is_filler,
                    slug: formData.slug || undefined,
                    is_visible: formData.is_visible,
                    display_order: formData.display_order,
                    category_id: formData.category_id,
                    website_price: storeOverride(formData.website_price, formData.price),
                    short_description: formData.short_description,
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
                } as any, { expectedUpdatedAt: baseUpdatedAtRef.current ?? undefined });
                baseUpdatedAtRef.current = savedUpdatedAt;

                // Stock is saved only when the merchant changed it, as a shelf
                // count applied to the current row, so orders that shipped
                // while the editor was open are not undone.
                const loaded = initialDataRef.current;
                if (loaded.stock_quantity !== formData.stock_quantity) {
                    await productRepository.setCountedStock({
                        productId: product.id,
                        counted: formData.stock_quantity,
                        notes: "Product editor",
                    });
                }
                const loadedVariantStock = new Map(
                    loaded.variants.flatMap((v) => (v.id ? [[v.id, v.stock_quantity] as const] : []))
                );

                // Handle variants. Only the variants this editor loaded (or
                // created in an earlier save) are updated or deleted, so a
                // variant someone else added meanwhile is left alone.
                const existingVariantIds = new Set(loadedVariantStock.keys());
                const savedVariants: typeof formData.variants = [];

                for (const variant of formData.variants) {
                    if (variant.id && existingVariantIds.has(variant.id)) {
                        await updateVariant(variant.id, {
                            name: variant.name,
                            price: variant.price,
                            ...(showCost && { cost: variant.cost }),
                            sku: variant.sku,
                            option_values: variant.option_values,
                            image_url: variant.image_url,
                            is_enabled: variant.is_enabled ?? true,
                        } as any);
                        if (loadedVariantStock.get(variant.id) !== variant.stock_quantity) {
                            await productRepository.setCountedStock({
                                productId: product.id,
                                variantId: variant.id,
                                counted: variant.stock_quantity,
                                notes: "Product editor",
                            });
                        }
                        existingVariantIds.delete(variant.id);
                        savedVariants.push(variant);
                    } else {
                        const created = await addVariant(product.id, {
                            name: variant.name,
                            price: variant.price,
                            cost: variant.cost,
                            stock_quantity: variant.stock_quantity,
                            sku: variant.sku,
                            option_values: variant.option_values,
                            image_url: variant.image_url,
                            is_enabled: variant.is_enabled ?? true,
                        } as any);
                        // Keep the new id, so the next save updates this
                        // variant instead of creating it again.
                        savedVariants.push({ ...variant, id: created.id });
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

                clearDraft();
                // Update initial data ref to new saved state
                const saved = { ...formData, variants: savedVariants };
                initialDataRef.current = saved;
                // Edits typed while saving stay; only the new ids are filled in.
                setFormData((current) => ({
                    ...current,
                    variants: current.variants.map((v, i) =>
                        v.id || !savedVariants[i]?.id ? v : { ...v, id: savedVariants[i].id }
                    ),
                }));
                toast.success(t("products.updated"));
            }

            return true;
        } catch (error) {
            toast.error(t(productWriteErrorKey(error)));
            return false;
        } finally {
            setSaving(false);
        }
    }, [formData, mode, product, addProduct, updateProduct, addVariant, updateVariant, deleteVariant, clearDraft, router, saveRelatedData, tenantId, t, showCost, relatedDataLoaded]);

    // Duplicate product
    const duplicateProduct = useCallback(async () => {
        if (!product) return;
        if (!relatedDataLoaded) {
            toast.error(t("products.ed.err.relatedNotLoaded"));
            return;
        }
        setSaving(true);
        try {
            const newProduct = await addProduct({
                name: t("products.ed.copyOf", { name: formData.name }),
                short_name: formData.short_name.trim() ? t("products.ed.copyOf", { name: formData.short_name.trim() }) : null,
                description: formData.description,
                sku: formData.sku ? uniqueCopyValue(formData.sku, new Set(catalogue.flatMap((p) => (p.sku ? [p.sku] : [])))) : undefined,
                price: formData.price,
                compare_at_price: formData.compare_at_price || undefined,
                cost: formData.cost,
                stock_quantity: 0,
                low_stock_threshold: formData.low_stock_threshold,
                reorder_point: formData.reorder_point,
                image_url: formData.image_url,
                tag_color: formData.tag_color,
                is_supply: formData.is_supply,
                is_filler: formData.is_filler,
                slug: formData.slug ? uniqueCopyValue(formData.slug, new Set(catalogue.flatMap((p) => (p.slug ? [p.slug] : [])))) : undefined,
                is_visible: false,
                display_order: formData.display_order,
                category_id: formData.category_id,
                website_price: storeOverride(formData.website_price, formData.price),
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

            toast.success(t("products.duplicated"));
            if (newProduct) {
                router.push(`/products/${newProduct.id}/edit`);
            }
        } catch (error) {
            toast.error(t(productWriteErrorKey(error)));
        } finally {
            setSaving(false);
        }
    }, [formData, product, catalogue, addProduct, addVariant, router, saveRelatedData, tenantId, t, relatedDataLoaded]);

    return {
        showCost,
        canEditSuppliers,
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
