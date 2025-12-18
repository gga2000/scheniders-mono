import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase environment variables are not set. Please configure them in .env.local');
}

// Create a single supabase client for the entire app
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions for our database tables
export interface Order {
    id: string;
    created_at: string;
    updated_at?: string;
    order_id: string;
    customer_name: string;
    phone: string;
    city?: string;
    governorate_code?: string;
    address_details?: string;
    items: OrderItem[];
    price: number;
    status: 'new' | 'contacted' | 'confirmed' | 'rejected' | 'delivered';
    whatsapp_link?: string;
    notes?: string;
    rejection_reason?: string;
    // New fields for enhanced orders
    scheduled_date?: string;
    priority: OrderPriority;
    payment_status: PaymentStatus;
    delivery_fee?: number;
    discount_amount?: number;
    is_return: boolean;
    original_order_id?: string;
    is_archived: boolean;
}

// Order priority levels
export type OrderPriority = 'normal' | 'high' | 'urgent';

// Payment status options
export type PaymentStatus = 'pending' | 'cod' | 'prepaid' | 'partial';

export interface OrderItem {
    name: string;
    quantity: number;
    price: number;
    sku?: string; // Product SKU from LightFunnels for matching
}

export interface Blacklist {
    phone: string;
    reason: string;
    created_at: string;
    added_by?: string;
    notes?: string;
}

// Product Management Types
export interface Product {
    id: string;
    created_at: string;
    updated_at?: string;
    name: string;
    description?: string;
    sku?: string; // Product SKU for matching with LightFunnels orders
    price: number;
    cost?: number;
    stock_quantity: number;
    low_stock_threshold: number;
    image_url?: string;
    is_archived: boolean;
    // Computed fields (not in DB)
    variants?: ProductVariant[];
    times_sold?: number;
    total_revenue?: number;
    profit_margin?: number;
    average_order_value?: number;
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

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export function getStockStatus(product: Product): StockStatus {
    if (product.stock_quantity <= 0) return 'out_of_stock';
    if (product.stock_quantity <= product.low_stock_threshold) return 'low_stock';
    return 'in_stock';
}

// =============================================
// ORDER ENHANCEMENT TYPES
// =============================================

// Preset rejection reasons
export interface RejectionReason {
    id: string;
    label: string;
    label_ar?: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
}

// Quick notes attached to orders
export interface OrderNote {
    id: string;
    order_id: string;
    note: string;
    created_by?: string;
    created_at: string;
}

// Order status change history for timeline
export interface OrderStatusHistory {
    id: string;
    order_id: string;
    from_status?: string;
    to_status: string;
    changed_by?: string;
    changed_at: string;
    notes?: string;
}

// Saved filter presets
export interface FilterPreset {
    id: string;
    name: string;
    filters: OrderFilters;
    page: string;
    created_by?: string;
    created_at: string;
}

// Filter configuration object
export interface OrderFilters {
    status?: Order['status'] | 'all';
    dateFrom?: string;
    dateTo?: string;
    city?: string;
    product?: string;
    priority?: OrderPriority;
    paymentStatus?: PaymentStatus;
    isReturn?: boolean;
    searchQuery?: string;
}

// WhatsApp message templates
export interface MessageTemplate {
    id: string;
    name: string;
    content: string;
    content_ar?: string;
    category: 'general' | 'confirmation' | 'shipping' | 'delay' | 'payment' | 'follow_up';
    variables: string[];
    sort_order: number;
    is_active: boolean;
    created_at: string;
}

// Follow-up reminders
export interface FollowUpReminder {
    id: string;
    order_id: string;
    reminder_date: string;
    note?: string;
    is_completed: boolean;
    created_at: string;
}

