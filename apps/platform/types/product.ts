// =============================================
// PRODUCT DOMAIN TYPES
// Centralized type definitions for all product-related entities
// =============================================

import type { Order } from './order';

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
    // Storefront fields (exposed to public store)
    slug?: string | null;
    is_visible?: boolean;
    display_order?: number;
    category_id?: string | null;
    website_price?: number | null;
    short_description?: string | null;
    // Computed fields (not in DB)
    variants?: ProductVariant[];
    times_sold?: number;
    total_revenue?: number;
    profit_margin?: number;
    average_order_value?: number;
}

export interface Category {
    id: string;
    tenant_id: string;
    name: string;
    slug: string;
    description?: string | null;
    image_url?: string | null;
    parent_id?: string | null;
    display_order: number;
    is_visible: boolean;
    created_at: string;
    updated_at: string;
}

export interface ProductVariant {
    id: string;
    product_id: string;
    created_at: string;
    updated_at?: string;
    name: string;
    price?: number;
    cost?: number;
    stock_quantity: number;
    sku?: string;
    option_values?: Record<string, string> | null;
    image_url?: string | null;
    is_enabled?: boolean;
}

export interface ProductOption {
    id: string;
    product_id: string;
    name: string;
    values: string[];
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

export interface QCItem {
    id: string;
    order_id?: string;
    product_id: string;
    quantity: number;
    status: 'pending_inspection' | 'restocked' | 'written_off';
    reason: string;
    created_at: string;
    resolved_at?: string;
    resolved_by?: string;
    notes?: string;
    // Joined fields
    product?: Product;
    order?: Order;
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

export function getStockStatus(product: Product): StockStatus {
    const available = product.stock_quantity - (product.reserved_quantity || 0);
    if (available <= 0) return 'out_of_stock';
    if (available <= product.low_stock_threshold) return 'low_stock';
    return 'in_stock';
}
