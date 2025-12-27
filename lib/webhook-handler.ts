import { supabase } from "./supabase";
import { formatPhoneToStandard } from "./order-utils";
import { generateWhatsAppLink } from "./utils";
import { validateAddress, getAddressStatus } from "./address-validator";
import type { OrderItem } from "./supabase";

/**
 * LightFunnels webhook payload structure (actual format from Lightfunnels)
 */
export interface LightFunnelsWebhookPayload {
    node: {
        id: string; // e.g., "order_gUG6SIMpAjBKRRCtkKs9V"
        __typename: string;
        _id: number; // numeric ID like 20479299
        total: number;
        subtotal?: number;
        name: string; // order number like "5552"
        notes?: string;
        email?: string;
        phone: string;
        created_at: string;
        cancelled_at?: string;
        tags: string[];
        shipping?: number;
        currency?: string;
        customer: {
            id: string;
            full_name: string;
            avatar?: string;
            location?: string;
        };
        items: Array<{
            __typename: string;
            product_id: string;
            id: string;
            _id: number;
            image?: { path: string };
            title: string;
            price: number;
            variant_id?: string;
            fulfillment_status?: string;
            sku?: string;
        }>;
        shipping_address?: {
            first_name?: string;
            last_name?: string;
            email?: string;
            phone?: string;
            line1?: string;
            line2?: string;
            country?: string;
            city?: string;
            area?: string;
            zip?: string;
            state?: string;
        };
        billing_address?: {
            first_name?: string;
            last_name?: string;
            phone?: string;
            city?: string;
            country?: string;
        };
        payments?: Array<{
            id: string;
            total: number;
            source?: {
                payment_gateway?: {
                    prototype?: {
                        key?: string; // e.g., "cod"
                    };
                };
            };
        }>;
    };
}

/**
 * Normalized webhook data for internal use
 */
export interface LightFunnelsWebhook {
    order_id: string;
    order_number: string;
    is_checkout: boolean; // true if this is an abandoned checkout, false if completed order
    customer: {
        name: string;
        phone: string;
        email?: string;
        city?: string;
        address?: string;
    };
    items: Array<{
        name: string;
        quantity: number;
        price: number;
        sku?: string;
        image_url?: string;
        product_id?: string;
    }>;
    total: number;
    created_at?: string;
    notes?: string;
    payment_method?: string;
}

/**
 * Parse and validate LightFunnels webhook payload (actual Lightfunnels format)
 */
export function parseLightFunnelsPayload(payload: any): LightFunnelsWebhook | null {
    try {
        // Check if payload has the node wrapper (actual Lightfunnels format)
        const node = payload.node || payload;

        // Validate required fields
        if (!node._id && !node.id) {
            console.error("Missing order ID in webhook payload");
            return null;
        }

        if (!node.phone && !node.shipping_address?.phone) {
            console.error("Missing phone number in webhook payload");
            return null;
        }

        if (!node.items || !Array.isArray(node.items) || node.items.length === 0) {
            console.error("Invalid or empty items array");
            return null;
        }

        // Extract customer name from various possible locations
        const customerName =
            node.customer?.full_name ||
            [node.shipping_address?.first_name, node.shipping_address?.last_name].filter(Boolean).join(' ') ||
            [node.billing_address?.first_name, node.billing_address?.last_name].filter(Boolean).join(' ') ||
            'Unknown Customer';

        // Extract phone from various locations
        const phone = node.phone || node.shipping_address?.phone || node.billing_address?.phone || '';

        // Extract city from shipping address or customer location
        const city =
            node.shipping_address?.city ||
            node.customer?.location?.split(',').pop()?.trim() ||
            '';

        // Build address from shipping address fields
        const addressParts = [
            node.shipping_address?.line1,
            node.shipping_address?.line2,
            node.shipping_address?.area,
        ].filter(Boolean);
        const address = addressParts.length > 0 ? addressParts.join(', ') : '';

        // Get payment method
        const paymentMethod = node.payments?.[0]?.source?.payment_gateway?.prototype?.key || 'unknown';

        // Normalize items
        const items = node.items.map((item: any) => ({
            name: item.title || item.name || 'Unknown Product',
            quantity: 1, // Lightfunnels doesn't send quantity, defaulting to 1
            price: item.price || 0,
            sku: item.sku,
            image_url: item.image?.path,
            product_id: item.product_id,
        }));

        // Detect if this is a checkout (abandoned) or a completed order
        // Checkouts have __typename "Checkout", orders have "Order"
        const isCheckout = node.__typename === 'Checkout' ||
            (node.id && String(node.id).startsWith('checkout_'));

        // Build normalized webhook data
        const normalized: LightFunnelsWebhook = {
            order_id: String(node._id || node.id),
            order_number: node.name || String(node._id),
            is_checkout: isCheckout,
            customer: {
                name: customerName.trim(),
                phone: phone,
                email: node.email || node.shipping_address?.email,
                city: city,
                address: address,
            },
            items,
            total: node.total || 0,
            created_at: node.created_at,
            notes: node.notes,
            payment_method: paymentMethod,
        };

        console.log("Parsed webhook payload:", JSON.stringify(normalized, null, 2));
        return normalized;
    } catch (error) {
        console.error("Error parsing webhook payload:", error);
        return null;
    }
}

/**
 * Check if order already exists (duplicate detection)
 */
export async function checkDuplicateOrder(lightfunnelsOrderId: string): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from("orders")
            .select("id")
            .eq("order_id", lightfunnelsOrderId)
            .single();

        if (error && error.code !== "PGRST116") {
            // PGRST116 = not found, which is what we want
            console.error("Error checking duplicate:", error);
            return false;
        }

        return !!data; // Returns true if order exists
    } catch (error) {
        console.error("Error in duplicate check:", error);
        return false;
    }
}

/**
 * Check if phone number is blacklisted
 */
export async function checkBlacklist(phone: string): Promise<{ isBlacklisted: boolean; reason?: string }> {
    try {
        const formattedPhone = formatPhoneToStandard(phone);

        const { data, error } = await supabase
            .from("blacklist")
            .select("reason")
            .eq("phone", formattedPhone)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("Error checking blacklist:", error);
            return { isBlacklisted: false };
        }

        return {
            isBlacklisted: !!data,
            reason: data?.reason,
        };
    } catch (error) {
        console.error("Error in blacklist check:", error);
        return { isBlacklisted: false };
    }
}

/**
 * Find product by SKU for linking
 */
async function findProductBySku(sku: string): Promise<{
    id: string;
    name: string;
    image_url?: string;
    tag_color?: string;
} | null> {
    if (!sku) return null;

    const { data } = await supabase
        .from('products')
        .select('id, name, image_url, tag_color')
        .eq('sku', sku)
        .single();

    return data;
}

/**
 * Create order from webhook data
 */
export async function createOrderFromWebhook(webhook: LightFunnelsWebhook) {
    try {
        // Format phone number
        const formattedPhone = formatPhoneToStandard(webhook.customer.phone);

        // Check blacklist
        const blacklistResult = await checkBlacklist(formattedPhone);
        if (blacklistResult.isBlacklisted) {
            return {
                success: false,
                error: "Customer is blacklisted",
                reason: blacklistResult.reason,
            };
        }

        // Check for duplicate using the same ID format that will be created
        const duplicateCheckId = webhook.is_checkout
            ? `CHK-${webhook.order_id}`
            : webhook.order_number;
        const isDuplicate = await checkDuplicateOrder(duplicateCheckId);
        if (isDuplicate) {
            return {
                success: false,
                error: "Order already exists",
                duplicate: true,
            };
        }

        // Map items with SKU for product matching
        const items: OrderItem[] = await Promise.all(
            webhook.items.map(async (item) => {
                const product = item.sku ? await findProductBySku(item.sku) : null;
                return {
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    sku: item.sku || undefined,
                    product_id: product?.id,
                    image_url: item.image_url || product?.image_url,
                    tag_color: product?.tag_color,
                };
            })
        );

        // Validate customer address
        const addressValidation = validateAddress(
            webhook.customer.city,
            undefined, // Lightfunnels doesn't provide governorate code
            webhook.customer.address
        );
        const addressStatus = getAddressStatus(addressValidation);

        // Determine if order needs attention due to address issues
        const hasAddressIssues = !addressValidation.isValid;
        const attentionReasons: string[] = [];
        if (hasAddressIssues) {
            attentionReasons.push('address_issue');
        }

        // For checkouts (abandoned), use CHK- prefix and pending_checkout status
        // When confirmed by employee, the app will assign a unique order number
        const orderId = webhook.is_checkout
            ? `CHK-${webhook.order_id}`
            : webhook.order_number;

        const orderStatus = webhook.is_checkout ? 'pending_checkout' : 'new';

        // Build WhatsApp message based on type
        const whatsappMessage = webhook.is_checkout
            ? `مرحباً ${webhook.customer.name}، لاحظنا أنك لم تكمل طلبك. هل تحتاج مساعدة؟`
            : `مرحباً ${webhook.customer.name}، شكراً لطلبك رقم ${webhook.order_number}`;

        // Prepare order data (only include fields that exist in the database)
        const orderData = {
            order_id: orderId,
            customer_name: webhook.customer.name.trim(),
            phone: formattedPhone,
            city: webhook.customer.city?.trim() || null,
            governorate_code: addressValidation.governorate?.code || null,
            address_details: webhook.customer.address?.trim() || null,
            items,
            price: webhook.total,
            status: orderStatus as any,
            priority: "normal" as const,
            payment_status: webhook.payment_method === 'cod' ? 'cod' as const : 'pending' as const,
            is_return: false,
            is_archived: false,
            source: 'lightfunnels' as const,
            whatsapp_link: generateWhatsAppLink(formattedPhone, whatsappMessage),
            notes: webhook.is_checkout
                ? `[سلة متروكة] ${webhook.notes?.trim() || ''}`.trim()
                : webhook.notes?.trim() || null,
        };

        // Insert into database
        const { data, error } = await supabase
            .from("orders")
            .insert([orderData])
            .select()
            .single();

        if (error) {
            console.error("Error creating order:", error);
            return {
                success: false,
                error: error.message,
            };
        }

        console.log(`Order created successfully: ${webhook.order_number}`);
        return {
            success: true,
            order: data,
        };
    } catch (error) {
        console.error("Error in createOrderFromWebhook:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Log webhook request for debugging
 */
export function logWebhookRequest(payload: any, result: any) {
    const timestamp = new Date().toISOString();
    console.log("=== WEBHOOK REQUEST ===");
    console.log("Timestamp:", timestamp);
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("Result:", JSON.stringify(result, null, 2));
    console.log("=====================");
}
