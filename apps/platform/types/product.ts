// =============================================
// PRODUCT DOMAIN TYPES
// Centralized type definitions for all product-related entities
// =============================================

import type { Order } from './order';

/** One note-highlight card on the storefront funnel PDP (products.feature_cards jsonb). */
export interface ProductFeatureCard {
    image_url?: string;
    title: string;
    body: string;
}

export interface Product {
    id: string;
    created_at: string;
    updated_at?: string;
    name: string;
    description?: string;
    sku?: string;
    lightfunnels_aliases?: string[];
    price: number;
    compare_at_price?: number;
    cost?: number;
    stock_quantity: number;
    reserved_quantity: number;
    open_box_quantity: number;
    low_stock_threshold: number;
    reorder_point?: number | null;
    image_url?: string;
    tag_color?: string;
    is_archived: boolean;
    is_supply: boolean;
    status: 'draft' | 'active' | 'archived';
    product_type: 'physical' | 'digital' | 'service' | 'bundle';
    // Physical product fields
    weight?: number | null;
    dimensions_json?: { length?: number; width?: number; height?: number } | null;
    // Digital product fields
    download_url?: string | null;
    file_size?: string | null;
    license_key_pattern?: string | null;
    // Service product fields
    duration_minutes?: number | null;
    booking_enabled?: boolean;
    // Barcode
    barcode?: string | null;
    // Landed cost
    cost_breakdown_json?: CostBreakdown | null;
    // Storefront fields (exposed to public store)
    slug?: string | null;
    is_visible?: boolean;
    display_order?: number;
    category_id?: string | null;
    website_price?: number | null;
    short_description?: string | null;
    // Funnel PDP note-highlight cards (products.feature_cards jsonb).
    // Rendered by the storefront pdp_direct_order section; empty/null = feature off.
    feature_cards?: ProductFeatureCard[] | null;
    // Computed fields (not in DB)
    variants?: ProductVariant[];
    times_sold?: number;
    total_revenue?: number;
    profit_margin?: number;
    average_order_value?: number;
}

// Canonical Category type lives in @scheniders/shared.
// Re-exported here for ergonomic imports from existing product code paths.
export type {
    Category,
    CategoryStatus,
    NavVariant,
    CategoryPageConfig,
    CategoryPageBlock,
    CategoryPageLayout,
    CategoryPageSort,
    CategoryPageFilter,
    ProductCategoryAssignment,
    CategoryRuleSource,
    Collection,
    CategoryRule,
    CategoryRuleData,
    CategoryRuleCondition,
    CategoryRuleField,
    CategoryRuleOp,
    CategoryRedirect,
    CategoryRelated,
    CategoryExperiment,
    CategoryExperimentMetrics,
} from "@scheniders/shared";
export { DEFAULT_CATEGORY_PAGE_CONFIG } from "@scheniders/shared";

export interface ProductVariant {
    id: string;
    product_id: string;
    created_at: string;
    updated_at?: string;
    name: string;
    price?: number;
    cost?: number;
    stock_quantity: number;
    reserved_quantity?: number;
    sku?: string;
    barcode?: string | null;
    option_values?: Record<string, string> | null;
    image_url?: string | null;
    is_enabled?: boolean;
    compare_at_price?: number | null;
    weight?: number | null;
    dimensions_json?: { length?: number; width?: number; height?: number; unit?: string } | null;
    low_stock_threshold?: number;
    display_order?: number;
}

export type VariantOptionType = "color" | "size" | "material" | "style" | "custom";

export interface OptionValueMetadata {
    label: string;
    hex?: string;         // for color type
    measurement?: string; // for size type
    description?: string; // for material type
}

export interface ProductOption {
    id: string;
    product_id: string;
    name: string;
    values: string[];
    values_metadata?: OptionValueMetadata[] | null;
    option_type?: VariantOptionType;
    display_order: number;
    tenant_id?: string;
    created_at: string;
}

export interface ProductPriceHistory {
    id: string;
    product_id: string;
    created_at: string;
    old_price?: number;
    new_price: number;
    changed_by?: string;
    reason?: string;
}

export type QCStatus =
    | 'pending_inspection'
    | 'in_inspection'
    | 'restocked'
    | 'written_off'
    | 'returned_to_supplier';

export type QCReasonCategory =
    | 'damaged'
    | 'expired'
    | 'defective'
    | 'wrong_item'
    | 'returned'
    | 'other';

export type QCResolution = 'restocked' | 'written_off' | 'returned_to_supplier';

export interface QCChecklistItem {
    id: string;
    label: string;
    checked: boolean;
}

export interface QCItem {
    id: string;
    order_id?: string;
    product_id: string;
    quantity: number;
    status: QCStatus;
    reason: string;
    created_at: string;
    resolved_at?: string;
    resolved_by?: string;
    notes?: string;
    // v2 fields (optional until migration applied)
    assigned_to?: string | null;
    reason_category?: QCReasonCategory | null;
    photos?: string[];
    rma_number?: string | null;
    credit_expected?: number | null;
    inspection_checklist?: QCChecklistItem[] | null;
    tenant_id?: string | null;
    // Joined fields
    product?: Product;
    order?: Order;
}

export interface QCEvent {
    id: string;
    qc_item_id: string;
    event_type:
        | 'created'
        | 'status_changed'
        | 'assigned'
        | 'photo_added'
        | 'photo_removed'
        | 'note_added'
        | 'checklist_updated'
        | 'reason_updated'
        | 'bulk_action';
    actor_id?: string | null;
    payload?: Record<string, any> | null;
    created_at: string;
}

export interface BundleItem {
    id: string;
    product_id: string;
    child_product_id: string;
    quantity: number;
    display_order: number;
    tenant_id?: string;
    created_at: string;
    // Joined field
    child_product?: Product;
}

export interface TieredPrice {
    id?: string;
    product_id?: string;
    min_quantity: number;
    max_quantity: number | null;
    price: number;
    tenant_id?: string;
    created_at?: string;
}

export interface OrderBump {
    id?: string;
    product_id?: string;
    bump_product_id: string;
    discount_percentage: number;
    headline: string;
    description: string;
    display_order: number;
    is_active: boolean;
    tenant_id?: string;
    created_at?: string;
    // Joined field
    bump_product?: Product;
}

export interface RelatedProduct {
    id?: string;
    product_id?: string;
    related_product_id: string;
    relation_type: 'complementary' | 'similar' | 'upsell';
    display_order: number;
    tenant_id?: string;
    created_at?: string;
    // Joined field
    related_product?: Product;
}

export type RelationType = 'complementary' | 'similar' | 'upsell';

export interface ProductFeature {
    id?: string;
    product_id?: string;
    icon: string;
    title: string;
    description: string;
    display_order: number;
    tenant_id?: string;
    created_at?: string;
}

export interface ProductFaq {
    id?: string;
    product_id?: string;
    question: string;
    answer: string;
    display_order: number;
    tenant_id?: string;
    created_at?: string;
}

export interface ProductTestimonial {
    id?: string;
    product_id?: string;
    customer_name: string;
    customer_photo_url?: string | null;
    rating: number;
    quote: string;
    is_featured: boolean;
    display_order: number;
    tenant_id?: string;
    created_at?: string;
}

export interface ProductReview {
    id?: string;
    product_id?: string;
    reviewer_name: string;
    reviewer_email?: string;
    rating: number;
    title: string;
    body: string;
    status: 'pending' | 'approved' | 'rejected' | 'featured';
    is_verified_purchase: boolean;
    is_manual: boolean;
    admin_response?: string | null;
    helpful_count: number;
    tenant_id?: string;
    created_at?: string;
}

export interface InventoryHistoryEntry {
    id?: string;
    product_id?: string;
    variant_id?: string | null;
    change_type: 'received' | 'sold' | 'returned' | 'adjusted' | 'reserved' | 'quarantined';
    quantity_change: number;
    quantity_before: number;
    quantity_after: number;
    reference_id?: string | null;
    notes?: string | null;
    changed_by?: string | null;
    tenant_id?: string;
    created_at?: string;
}

export interface ProductSupplier {
    id?: string;
    product_id?: string;
    supplier_name: string;
    supplier_contact?: string | null;
    supplier_email?: string | null;
    lead_time_days?: number | null;
    minimum_order_quantity?: number | null;
    unit_cost?: number | null;
    notes?: string | null;
    is_primary: boolean;
    tenant_id?: string;
    created_at?: string;
}

export interface ProductActivityLog {
    id: string;
    product_id: string;
    user_id?: string | null;
    action: 'created' | 'updated' | 'status_changed' | 'price_changed' | 'image_added' | 'variant_added' | 'variant_removed' | 'inventory_adjusted' | 'published' | 'archived';
    changes_json?: Record<string, { before: any; after: any }> | null;
    tenant_id?: string;
    created_at: string;
}

export type InventoryChangeType = 'received' | 'sold' | 'returned' | 'adjusted' | 'reserved' | 'quarantined';

export type ProductType = 'physical' | 'digital' | 'service' | 'bundle';

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

// =============================================
// PHASE 5: Product Information Types
// =============================================

export interface CostBreakdown {
    supplier_cost: number;
    shipping: number;
    customs: number;
    handling: number;
    other: number;
}

export interface StorageLocation {
    id: string;
    tenant_id: string;
    name: string;
    code: string;
    type: 'warehouse' | 'zone' | 'aisle' | 'shelf' | 'bin';
    parent_id?: string | null;
    description?: string | null;
    capacity?: number | null;
    created_at: string;
}

export interface ProductStorage {
    id: string;
    product_id: string;
    variant_id?: string | null;
    location_id: string;
    quantity: number;
    tenant_id: string;
    updated_at: string;
    // Joined
    storage_locations?: StorageLocation;
}

export interface ProductBatch {
    id: string;
    product_id: string;
    variant_id?: string | null;
    batch_number: string;
    expiry_date?: string | null;
    quantity: number;
    cost_per_unit?: number | null;
    received_at: string;
    notes?: string | null;
    status: 'active' | 'expired' | 'written_off';
    tenant_id: string;
    created_at: string;
}

export interface ProductTag {
    id: string;
    tenant_id: string;
    name: string;
    color: string;
    created_at: string;
}

export interface ProductTagAssignment {
    product_id: string;
    tag_id: string;
    product_tags?: ProductTag;
}

export interface SmartCollection {
    id: string;
    tenant_id: string;
    name: string;
    description?: string | null;
    rules_json: CollectionRule[];
    is_active: boolean;
    created_at: string;
}

export interface CollectionRule {
    field: string;
    operator: string;
    value: string | number | boolean;
    value2?: number;
    conjunction: 'and' | 'or';
}

export type StorageLocationType = 'warehouse' | 'zone' | 'aisle' | 'shelf' | 'bin';

export type BatchStatus = 'active' | 'expired' | 'written_off';

// =============================================
// PHASE 6: Inventory Operations Types
// =============================================

export type PurchaseOrderStatus = 'draft' | 'sent' | 'confirmed' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrder {
    id: string;
    tenant_id: string;
    po_number: string;
    supplier_name: string;
    supplier_contact?: string | null;
    supplier_email?: string | null;
    status: PurchaseOrderStatus;
    total_cost: number;
    notes?: string | null;
    expected_date?: string | null;
    sent_at?: string | null;
    received_at?: string | null;
    created_by?: string | null;
    created_at: string;
    updated_at: string;
    // Joined
    items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
    id: string;
    po_id: string;
    product_id: string;
    variant_id?: string | null;
    product_name: string;
    variant_name?: string | null;
    sku?: string | null;
    quantity_ordered: number;
    quantity_received: number;
    unit_cost: number;
    notes?: string | null;
    created_at: string;
    // Computed
    total_cost?: number;
    // Joined
    product?: Product;
}

export type StockTakeStatus = 'in_progress' | 'completed' | 'cancelled';

export interface StockTake {
    id: string;
    tenant_id: string;
    name: string;
    status: StockTakeStatus;
    started_by?: string | null;
    completed_at?: string | null;
    notes?: string | null;
    total_counted: number;
    total_variance: number;
    variance_value: number;
    created_at: string;
    updated_at: string;
    // Joined
    items?: StockTakeItem[];
}

export interface StockTakeItem {
    id: string;
    stock_take_id: string;
    product_id: string;
    variant_id?: string | null;
    location_id?: string | null;
    expected_quantity: number;
    counted_quantity?: number | null;
    variance?: number | null;
    reason?: string | null;
    counted_at?: string | null;
    created_at: string;
    // Joined
    product?: Product;
}

export type InventoryAlertType = 'stockout' | 'low_stock' | 'overstock' | 'expiring' | 'dead_stock' | 'po_due';

export interface InventoryAlert {
    id: string;
    tenant_id: string;
    product_id?: string | null;
    alert_type: InventoryAlertType;
    message: string;
    is_read: boolean;
    is_dismissed: boolean;
    snoozed_until?: string | null;
    metadata_json?: Record<string, any> | null;
    created_at: string;
    // Joined
    product?: Product;
}

export type ShrinkageType = 'shrinkage_damaged' | 'shrinkage_stolen' | 'shrinkage_expired' | 'shrinkage_other';

export type ExtendedInventoryChangeType = InventoryChangeType | ShrinkageType | 'transfer' | 'stock_take';

export function getStockStatus(product: Product): StockStatus {
    const available = product.stock_quantity - (product.reserved_quantity || 0);
    if (available <= 0) return 'out_of_stock';
    if (available <= product.low_stock_threshold) return 'low_stock';
    return 'in_stock';
}
