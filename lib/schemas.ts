import { z } from 'zod';

// =============================================
// ENUMS & CONSTANTS
// =============================================

export const OrderStatusEnum = z.enum([
    'new',
    'contacted',
    'confirmed',
    'cancelled',
    'in_transit',
    'delivered',
    'rejected',
    'completed',
    'no_response',
    'return_pending',
    'refund_delivered',
    'refund_failed',
    'pending_checkout'
]);

export const OrderPriorityEnum = z.enum(['normal', 'high', 'urgent']);
export const PaymentStatusEnum = z.enum(['pending', 'cod', 'prepaid', 'partial', 'paid']);
export const DeliverySlotEnum = z.enum(['morning', 'afternoon', 'evening']);
export const OrderSourceEnum = z.enum(['whatsapp', 'lightfunnels', 'meta', 'tiktok', 'delivery_import', 'shop', 'other']);
export const TagColorEnum = z.enum(['yellow', 'green', 'blue', 'pink', 'purple']).nullable();
export const AddressStatusEnum = z.enum(['valid', 'incomplete', 'invalid', 'needs_review']);

// =============================================
// SUB-SCHEMAS
// =============================================

export const OrderItemSchema = z.object({
    name: z.string().min(1, "Product name is required"),
    quantity: z.number().int().positive("Quantity must be positive"),
    price: z.number().min(0, "Price cannot be negative"),
    compare_at_price: z.number().optional(),
    sku: z.string().optional(),
    product_id: z.string().optional(),
    image_url: z.string().optional(),
    tag_color: z.string().optional()
});

// =============================================
// MAIN ENTITY SCHEMAS
// =============================================

export const OrderSchema = z.object({
    id: z.string().uuid().optional(), // Optional for creation
    created_at: z.string().optional(),
    updated_at: z.string().optional(),

    order_id: z.string().optional(), // Auto-generated if not provided
    customer_name: z.string().min(1, "Customer name is required"),
    phone: z.string().refine((val) => val === '' || val.length >= 10, { message: "Phone number must be valid" }),
    secondary_phone: z.string().nullable().optional(),

    city: z.string().nullable().optional(),
    governorate_code: z.string().nullable().optional(),
    address_details: z.string().nullable().optional(),

    items: z.array(OrderItemSchema).min(1, "Order must have at least one item"),

    price: z.number(), // Can be negative for return orders
    status: OrderStatusEnum.default('new'),

    whatsapp_link: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    internal_notes: z.string().nullable().optional(),
    rejection_reason: z.string().nullable().optional(),

    scheduled_date: z.string().nullable().optional(),
    priority: OrderPriorityEnum.default('normal'),
    payment_status: PaymentStatusEnum.default('pending'),

    delivery_fee: z.number().optional(),
    discount_amount: z.number().optional(),

    is_return: z.boolean().default(false),
    original_order_id: z.string().optional(),
    is_archived: z.boolean().default(false),
    is_pinned: z.boolean().optional(),

    delivery_slot: DeliverySlotEnum.optional(),
    source: OrderSourceEnum.default('other'),
    sequence_number: z.number().int().optional(),

    // Tracking
    delivered_at: z.string().optional(),
    cancelled_at: z.string().optional(),
    printed_at: z.string().optional(),
    print_count: z.number().optional(),
    last_batch_id: z.string().optional(),

    is_gift: z.boolean().optional(),

    // Attention & Review
    needs_attention: z.boolean().optional(),
    attention_reasons: z.array(z.string()).optional(),
    delivery_cost: z.number().optional(),
    tag_color: TagColorEnum.optional(),
    delivery_order_id: z.string().optional(),
    is_reviewed: z.boolean().optional(),
    is_verified_customer: z.boolean().optional(),
    contact_count: z.number().optional(),

    address_status: AddressStatusEnum.optional(),
    address_issues: z.array(z.string()).optional(),
    validated_governorate_code: z.string().optional(),
    risk_metadata: z.any().optional()
});

export const ProductSchema = z.object({
    id: z.string().uuid().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),

    name: z.string().min(1, "Product name is required"),
    description: z.string().optional(),
    sku: z.string().optional(),
    lightfunnels_aliases: z.array(z.string()).optional(),

    price: z.number().min(0, "Price cannot be negative"),
    compare_at_price: z.number().optional(),
    cost: z.number().optional(),

    stock_quantity: z.number().int(),
    low_stock_threshold: z.number().int().default(5),

    image_url: z.string().optional(),
    tag_color: z.string().optional(),
    is_archived: z.boolean().default(false)
});

// =============================================
// HELPER TYPES (Inferred)
// =============================================

export type OrderFormValues = z.infer<typeof OrderSchema>;
export type ProductFormValues = z.infer<typeof ProductSchema>;
