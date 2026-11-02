import type { DeliverySlot } from '@/lib/orders/delivery-slot';
// =============================================
// ORDER DOMAIN TYPES
// Centralized type definitions for all order-related entities
// =============================================

import type { AdAttribution } from '@/lib/ad-attribution';
import type { OrderRiskData } from '@/lib/customer-trust-risk';

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

/** orders.abandoned_cart_outcome (CHECK orders_abandoned_cart_outcome_check). */
export type AbandonedCartOutcome =
    | 'contacted'
    | 'returned'
    | 'already_ordered'
    | 'junk_phone'
    | 'junk_location'
    | 'expired'
    | 'kept';

export type OrderPriority = 'normal' | 'high' | 'urgent';

export type PaymentStatus = 'pending' | 'cod' | 'prepaid' | 'partial' | 'paid';

/** A default window or the customer's exact time (lib/orders/delivery-slot.ts). */
export type { DeliverySlot };

// Every value orders.source holds in production (checked 2026-11-01), incl.
// 'prime', 'excel_import' and 'manual', which the old union left out.
export type OrderSource = 'whatsapp' | 'lightfunnels' | 'meta' | 'tiktok' | 'delivery_import' | 'shop' | 'telegram' | 'storefront' | 'prime' | 'excel_import' | 'manual' | 'other';

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
    is_ai_extracted?: boolean;
}

export interface Order {
    id: string;
    /**
     * Owning tenant. Optional in this shape because the client rarely reads it —
     * every client query is already tenant-scoped by RLS — but server code that
     * writes a related row needs it, and a `select("*")` always returns it.
     */
    tenant_id?: string;
    created_at: string;
    updated_at?: string;
    /**
     * Server-assigned revision counter, incremented by the
     * `increment_orders_version` BEFORE UPDATE trigger. Used as the
     * optimistic-concurrency token (see order-repository.update) and for
     * realtime dedup — a client must never set this itself.
     */
    version?: number;
    /**
     * Soft-delete timestamp. Rows keep it until the cleanup cron removes them
     * 30 days later (app/api/cron/cleanup-deleted-orders). `null`/absent means
     * the order is live.
     */
    deleted_at?: string | null;
    order_id: string;
    customer_name: string;
    phone: string;
    secondary_phone?: string;
    /** Which number the customer asked to be contacted on. Null = never stated. */
    whatsapp_contact_slot?: 'primary' | 'secondary' | null;
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
    /** Day the order is postponed to (Baghdad calendar day, "YYYY-MM-DD"). Null = not scheduled. */
    scheduled_date?: string | null;
    priority: OrderPriority;
    payment_status: PaymentStatus;
    delivery_fee?: number;
    discount_amount?: number;
    is_return: boolean;
    is_replacement: boolean;
    original_order_id?: string;
    original_created_at?: string;
    /**
     * Refund financial dimension. Independent of order status. Kept in step by
     * the database from this order's refund orders: `pending` while one is
     * open, `partial` when some of what was bought has been refunded,
     * `refunded` when all of it has. Never written by the browser.
     */
    refund_status?: 'none' | 'pending' | 'partial' | 'refunded' | 'failed';
    refunded_at?: string;
    /** FK to order_reasons.id when the cancellation/rejection reason was picked from the managed list. */
    reason_id?: string;
    is_archived: boolean;
    is_pinned?: boolean;
    delivery_slot?: DeliverySlot;
    source?: OrderSource;
    /** Staff member (user_profiles.id) who typed the order in; null when it arrived on its own. Set by the server only. */
    entered_by?: string | null;
    /** Which ad the customer clicked — `source` only says which system sent the order. */
    attribution?: AdAttribution | null;
    /** Denormalized `attribution.channel` (facebook | instagram | tiktok | …) so the list can filter without unpacking jsonb. */
    ad_channel?: string | null;
    sequence_number?: number;
    delivered_at?: string;
    cancelled_at?: string;
    /**
     * Set by the `trg_order_completed_at` trigger when an order reaches
     * `completed`. Used as the fallback realized-revenue instant for rows that
     * completed without a recorded delivery (see lib/order-revenue).
     */
    completed_at?: string;
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
    /** Built from `customer_trust` — see lib/customer-trust-risk.ts. */
    risk_data?: OrderRiskData;
    last_status_changed_by_name?: string;
    last_status_changed_by_avatar?: string;
    /** Who last messaged the customer. `_avatar` is "bot" for automated sends. */
    last_followup_by_name?: string | null;
    last_followup_by_avatar?: string | null;
    last_followup_at?: string | null;
    last_followup_type?: 'reminder' | 'discount' | 'confirmation' | 'manual' | null;
    is_test?: boolean;
    /** When /api/webhooks/storefront-order claimed this order's automatic
     *  WhatsApp confirmation. Null = not claimed (every non-storefront order). */
    confirmation_dispatched_at?: string | null;
    /** When this order was captured as an abandoned cart; null = never was one.
     *  All abandoned_cart_* columns are written by the database only. */
    abandoned_cart_at?: string | null;
    /** Null while the cart is still open in Abandoned. */
    abandoned_cart_outcome?: AbandonedCartOutcome | null;
    abandoned_cart_resolved_at?: string | null;
    /** Staff member who took the cart out of Abandoned. */
    abandoned_cart_resolved_by_name?: string | null;
    /** The cart this order replaced, or the order that replaced this cart. */
    abandoned_cart_order_id?: string | null;
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
    assigned_to?: string;
    assigned_at?: string;
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

/**
 * Shape of a row from the `order_reasons` table, exposed here for legacy
 * aux-data consumers that imported `RejectionReason` from this module.
 * New code should import `OrderReason` from `@/lib/order-reasons`.
 */
export interface RejectionReason {
    id: string;
    kind?: string;
    label_ar: string;
    label_en?: string | null;
    sort_order: number;
    is_active: boolean;
    created_at?: string;
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
    riskLevel?: RiskLevel;
    /** Sub-filter for the Confirmed / All tabs to narrow to return or replacement orders. */
    orderType?: 'refund' | 'replacement' | 'abandoned_cart';
    /** Ad channel (`orders.ad_channel`) the list is pinned to; undefined = every channel. */
    adChannel?: string;
    /** Normalized campaign name (lib/ad-campaign-filter) the list is pinned to, or NO_CAMPAIGN; undefined = every campaign. */
    adCampaign?: string;
}

/**
 * What order creation accepts.
 *
 * ARCH-3: CreateOrderModal declared `onCreate: (orderData: any) => Promise<any>`,
 * so every caller had to cast. This mirrors `createOrder` in use-order-crud so
 * the modal and the hook agree without an `any` in between.
 */
type OrderColumnsWithDbDefaults =
    | "status"
    | "priority"
    | "payment_status"
    | "is_return"
    | "is_replacement"
    | "is_archived"
    // Generated server-side by create_order_atomic from the global counter
    // (see INT-7), so a caller neither knows nor should invent it.
    | "order_id";

export type CreateOrderInput =
    // Columns the database defaults are optional here, so a caller is not made
    // to invent values Postgres already supplies (verified against the live
    // schema: status 'new', priority 'normal', payment_status 'cod', and the
    // three booleans false).
    Omit<Order, "id" | "created_at" | "updated_at" | OrderColumnsWithDbDefaults> &
    Partial<Pick<Order, OrderColumnsWithDbDefaults>> & {
        custom_created_at?: string | null;
    };

export type CreateOrderResult = { success: boolean; data?: Order; error?: string };

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
