import { createBrowserClient } from '@supabase/ssr';

// Supabase configuration - trim to remove any trailing newlines from .env
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase environment variables are not set. Please configure them in .env.local');
}

// Create a single supabase client for the entire app with proper auth persistence
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// Type definitions for our database tables
export interface Order {
    id: string;
    created_at: string;
    updated_at?: string;
    order_id: string;
    customer_name: string;
    phone: string;
    secondary_phone?: string; // Secondary phone number from Excel import
    city?: string;
    governorate_code?: string;
    address_details?: string;
    items: OrderItem[];
    price: number;
    // Status flow: new → contacted → confirmed/cancelled → in_transit → delivered/rejected
    status: OrderStatus;
    whatsapp_link?: string;
    notes?: string; // Order notes - shown on invoice
    internal_notes?: string; // Internal notes between employees - not shown on invoice
    rejection_reason?: string;
    // New fields for enhanced orders
    scheduled_date?: string;
    priority: OrderPriority;
    payment_status: PaymentStatus;
    delivery_fee?: number;
    discount_amount?: number;
    is_return: boolean;
    original_order_id?: string;
    original_created_at?: string; // Tracks the original creation date if the order date is modified
    is_archived: boolean;
    is_pinned?: boolean;
    delivery_slot?: 'morning' | 'afternoon' | 'evening';
    source?: 'whatsapp' | 'lightfunnels' | 'meta' | 'tiktok' | 'delivery_import' | 'shop' | 'other';
    sequence_number?: number; // Global order counter (#178, #179, etc.)
    // Delivery tracking
    delivered_at?: string; // Timestamp when marked delivered (activates 7-day guarantee)
    cancelled_at?: string; // Timestamp when customer cancelled
    // Print tracking
    printed_at?: string; // Timestamp of last print
    print_count?: number; // Number of times printed
    last_batch_id?: string; // Last batch this order was printed in
    is_gift?: boolean; // If true, hide price on label
    is_shop_order?: boolean; // True for in-person shop orders (no delivery)
    // Attention flags for orders needing manual review
    needs_attention?: boolean;
    attention_reasons?: string[]; // ['missing_phone', 'missing_product', 'price_changed', etc.]
    delivery_cost?: number; // Delivery fee from delivery company
    tag_color?: 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | null; // Row highlight color
    delivery_order_id?: string; // Alias order ID from delivery company (searchable)
    is_reviewed?: boolean; // Whether a delivered order has been reviewed by an employee
    is_verified_customer?: boolean; // Whether this customer has been verified as returning customer (not duplicate)
    contact_count?: number; // Number of WhatsApp messages sent (0=green, 1=yellow, 2=orange, 3+=red)
    // Address validation
    address_status?: 'valid' | 'incomplete' | 'invalid' | 'needs_review';
    address_issues?: string[]; // ['missing_governorate', 'incomplete_address', 'possible_typo']
    validated_governorate_code?: string; // Our standardized code (BGD, NAS, etc.)
    risk_metadata?: any; // JSONB storage for risk assessment details
}

// Order status types
// - new: Just received
// - contacted: Employee reached out to customer
// - confirmed: Customer confirmed the order
// - cancelled: Customer cancelled the order
// - in_transit: Order shipped to delivery company
// - delivered: Delivery confirmed by delivery person
// - rejected: Delivery rejected at the door
// - completed: Delivery verified and finalized (طلب تام)
// - no_response: Customer never responded to contact attempts (لم يرد)
// - return_pending: Return order awaiting processing (استرجاع معلق)
export type OrderStatus = 'new' | 'contacted' | 'confirmed' | 'cancelled' | 'in_transit' | 'delivered' | 'rejected' | 'completed' | 'no_response' | 'return_pending' | 'refund_delivered' | 'refund_failed' | 'pending_checkout';

// Order priority levels
export type OrderPriority = 'normal' | 'high' | 'urgent';

// Payment status options
export type PaymentStatus = 'pending' | 'cod' | 'prepaid' | 'partial' | 'paid';

export interface OrderItem {
    name: string;
    quantity: number;
    price: number;
    compare_at_price?: number; // Original price before discount (for calculating discount %)
    sku?: string; // Product SKU from LightFunnels for matching
    product_id?: string; // Matched product ID
    image_url?: string; // Product image URL
    tag_color?: string; // Product tag color
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
    lightfunnels_aliases?: string[]; // Alternative names/patterns from Lightfunnels that map to this product
    price: number;
    compare_at_price?: number; // Original price before discount (shows "was X, now Y")
    cost?: number;
    stock_quantity: number;
    low_stock_threshold: number;
    image_url?: string;
    tag_color?: string; // Custom tag color for product display
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
    isArchived?: boolean;
    searchQuery?: string;
    riskLevel?: 'low' | 'medium' | 'high' | 'blocked' | 'flagged';
}

// WhatsApp message templates
export interface MessageTemplate {
    id: string;
    name: string;
    content: string;
    content_ar?: string;
    category: 'general' | 'confirmation' | 'shipping' | 'delay' | 'payment' | 'follow_up' | 'reminder' | 'discount';
    variables: string[];
    sort_order: number;
    is_active: boolean;
    created_at: string;
    // 3-step workflow template type
    template_type?: 'confirmation' | 'reminder' | 'discount';
    // For discount template calculations (default 10%)
    discount_percentage?: number;
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

export interface PrintBatch {
    id: string;
    name: string;
    created_at: string;
    order_count: number;
    total_value: number;
    cities: string[];
    order_ids: string[];
    invoice_template?: string;
    print_type?: string;
    pdf_url?: string;
}

