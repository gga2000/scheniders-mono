// =============================================
// ORDER DOMAIN TYPES
// Centralized type definitions for all order-related entities
// =============================================

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
// - suspended: Confirmed order delayed due to stock/waiting time (طلب معلق)
export type OrderStatus = 'new' | 'contacted' | 'confirmed' | 'cancelled' | 'in_transit' | 'delivered' | 'rejected' | 'completed' | 'no_response' | 'return_pending' | 'refund_delivered' | 'refund_failed' | 'pending_checkout' | 'suspended';

export type OrderPriority = 'normal' | 'high' | 'urgent';

export type PaymentStatus = 'pending' | 'cod' | 'prepaid' | 'partial' | 'paid';

export type DeliverySlot = 'morning' | 'afternoon' | 'evening';

export type OrderSource = 'whatsapp' | 'lightfunnels' | 'meta' | 'tiktok' | 'delivery_import' | 'shop' | 'other';

export type OrderTagColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | null;

export type AddressStatus = 'valid' | 'incomplete' | 'invalid' | 'needs_review';

export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked' | 'flagged';

export interface RiskMetadata {
    score?: number;
    level?: RiskLevel;
    reasons?: string[];
    blacklisted?: boolean;
    duplicateCount?: number;
    rejectionRate?: number;
    [key: string]: unknown;
}

export interface OrderItem {
    name: string;
    quantity: number;
    price: number;
    compare_at_price?: number;
    sku?: string;
    product_id?: string;
    variant_id?: string;
    image_url?: string;
    tag_color?: string;
    is_open_box?: boolean;
}

export interface Order {
    id: string;
    created_at: string;
    updated_at?: string;
    order_id: string;
    customer_name: string;
    phone: string;
    secondary_phone?: string;
    city?: string;
    governorate_code?: string;
    address_details?: string;
    items: OrderItem[];
    price: number;
    status: OrderStatus;
    whatsapp_link?: string;
    notes?: string;
    internal_notes?: string;
    rejection_reason?: string;
    scheduled_date?: string;
    priority: OrderPriority;
    payment_status: PaymentStatus;
    delivery_fee?: number;
    discount_amount?: number;
    is_return: boolean;
    is_replacement: boolean;
    original_order_id?: string;
    original_created_at?: string;
    /** Refund financial dimension. Independent of order status. */
    refund_status?: 'none' | 'pending' | 'refunded' | 'failed';
    refunded_at?: string;
    /** FK to rejection_reasons.id when the cancellation/return reason was picked from the managed list. */
    rejection_reason_id?: string;
    is_archived: boolean;
    is_pinned?: boolean;
    delivery_slot?: DeliverySlot;
    source?: OrderSource;
    sequence_number?: number;
    delivered_at?: string;
    cancelled_at?: string;
    printed_at?: string;
    print_count?: number;
    last_batch_id?: string;
    is_gift?: boolean;
    is_shop_order?: boolean;
    needs_attention?: boolean;
    attention_reasons?: string[];
    delivery_cost?: number;
    tag_color?: OrderTagColor;
    delivery_order_id?: string;
    delivery_note?: string;
    is_reviewed?: boolean;
    is_verified_customer?: boolean;
    contact_count?: number;
    last_contacted_at?: string;
    address_status?: AddressStatus;
    address_issues?: string[];
    validated_governorate_code?: string;
    risk_metadata?: RiskMetadata;
    risk_data?: {
        level: RiskLevel;
        score: number;
        reasons: string[];
        stats: Record<string, unknown>;
        last_updated: string;
    };
    last_status_changed_by_name?: string;
    last_status_changed_by_avatar?: string;
    is_test?: boolean;
    // Delivery company tracking
    delivery_company?: 'prime' | 'waseet' | null;
    // Al-Waseet specific fields
    waseet_qr_id?: string;
    waseet_qr_link?: string;
    waseet_status_id?: number;
    waseet_status_text?: string;
    waseet_merchant_price?: number;
    waseet_company_price?: number;
    waseet_submitted_at?: string;
    waseet_invoice_id?: string;
}

export interface Blacklist {
    phone: string;
    reason: string;
    created_at: string;
    added_by?: string;
    notes?: string;
}

// =============================================
// ORDER ENHANCEMENT TYPES
// =============================================

export interface RejectionReason {
    id: string;
    label: string;
    label_ar?: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
}

export interface OrderNote {
    id: string;
    order_id: string;
    note: string;
    created_by?: string;
    created_at: string;
}

export interface OrderStatusHistory {
    id: string;
    order_id: string;
    from_status?: string;
    to_status: string;
    changed_by?: string;
    changed_at: string;
    notes?: string;
}

export interface OrderFilters {
    status?: Order['status'] | 'all' | 'refunds' | 'refunded' | 'refund_pending' | 'replacements';
    dateFrom?: string;
    dateTo?: string;
    city?: string;
    product?: string;
    priority?: OrderPriority;
    paymentStatus?: PaymentStatus;
    isReturn?: boolean;
    isArchived?: boolean;
    searchQuery?: string;
    searchIncludesArchive?: boolean;
    riskLevel?: RiskLevel;
    /** Sub-filter for the Confirmed / All tabs to narrow to return or replacement orders. */
    orderType?: 'refund' | 'replacement';
}

export interface FilterPreset {
    id: string;
    name: string;
    filters: OrderFilters;
    page: string;
    created_by?: string;
    created_at: string;
}

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
    template_type?: 'confirmation' | 'reminder' | 'discount';
    discount_percentage?: number;
}

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
    // Smart batching fields
    sequence_order?: string[];    // Optimized order IDs sequence for printing
    pick_list?: unknown;          // Consolidated pick list (PickListItem[])
    efficiency_score?: number;    // 0-100 efficiency score
    strategy?: string;            // Batching strategy: auto, sku-heavy, priority-first, single-item
    context_switches?: number;    // Number of SKU transitions
}
