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
    image_url?: string;
    tag_color?: string;
    is_archived: boolean;
    is_supply: boolean;
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

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export function getStockStatus(product: Product): StockStatus {
    const available = product.stock_quantity - (product.reserved_quantity || 0);
    if (available <= 0) return 'out_of_stock';
    if (available <= product.low_stock_threshold) return 'low_stock';
    return 'in_stock';
}
