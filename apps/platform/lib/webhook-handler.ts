import { supabase } from "./supabase";
import { formatPhoneToStandard } from "./order-utils";
import { generateWhatsAppLink } from "./utils";
import { validateAddress, getAddressStatus, extractAndSeparateGovernorate } from "./address-validator";
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
 * Parse and validate LightFunnels webhook payload (handles both order and checkout formats)
 */
export function parseLightFunnelsPayload(payload: any): LightFunnelsWebhook | null {
    try {
        // Check if payload has the node wrapper (order automation format)
        const node = payload.node || payload;

        // Detect checkout format: has first_name at root or step_id (checkout-specific)
        const isCheckoutFormat = !payload.node && (node.first_name !== undefined || node.step_id !== undefined);

        console.log("Webhook type:", isCheckoutFormat ? "Checkout" : "Order");

        // Validate required fields
        if (node._id == null && node.id == null) {
            const msg = `Missing order/checkout ID in webhook payload. Payload keys: ${Object.keys(node).join(', ')}`;
            console.error(msg);
            throw new Error(msg);
        }

        // Check if this is a minimal/incomplete payload (test payload or checkout notification with just ID)
        // Lightfunnels sometimes sends checkout webhooks with only the ID - we can't create an order from these
        // We treat them as successful (return 200) since there's nothing to process
        const keys = Object.keys(node);
        const hasMinimalData = keys.length <= 3 && (node.id != null || node._id != null) && !node.items;
        if (hasMinimalData) {
            console.log("Detected minimal/incomplete payload (test or ID-only checkout):", node.id || node._id);
            throw new Error("is_test_payload");
        }

        if (!node.phone && !node.shipping_address?.phone && !node.billing_address?.phone) {
            // Check for dummy/test indicators
            const isTest = node.email?.includes('example.com') || node.customer?.email?.includes('example.com');
            if (!isTest) {
                const msg = `Missing phone number. Node has phone: ${!!node.phone}, Shipping phone: ${!!node.shipping_address?.phone}`;
                console.error(msg);
                throw new Error(msg);
            }
        }

        if (!node.items || !Array.isArray(node.items) || node.items.length === 0) {
            const msg = `Invalid or empty items array. Items type: ${typeof node.items}`;
            console.error(msg);
            throw new Error(msg);
        }

        // Extract customer name based on format
        let customerName: string;
        if (isCheckoutFormat) {
            // Checkout: first_name/last_name at root
            customerName = [node.first_name, node.last_name].filter(Boolean).join(' ').trim() || 'Unknown Customer';
        } else {
            // Order: customer.full_name or from addresses
            customerName =
                node.customer?.full_name ||
                [node.shipping_address?.first_name, node.shipping_address?.last_name].filter(Boolean).join(' ') ||
                [node.billing_address?.first_name, node.billing_address?.last_name].filter(Boolean).join(' ') ||
                'Unknown Customer';
        }

        // Extract phone
        const phone = node.phone || node.shipping_address?.phone || node.billing_address?.phone || '';

        // Extract city and address - Lightfunnels often puts governorate + address in city field
        // e.g., "النجف حي الامير مقابل قاعه عشتار" should be split into:
        // - city: "النجف"
        // - address: "حي الامير مقابل قاعه عشتار"
        const rawCity = node.shipping_address?.city || node.customer?.location?.split(',').pop()?.trim() || '';
        const rawAddress = [
            node.shipping_address?.line1,
            node.shipping_address?.line2,
            node.shipping_address?.area,
        ].filter(Boolean).join(', ');

        // Try to separate governorate from the city field if it contains both
        const { governorate, city: extractedCity, remainingAddress: extractedAddress } = extractAndSeparateGovernorate(rawCity);

        // Use extracted values if a governorate was found, otherwise use raw values
        const city = governorate ? extractedCity : rawCity;
        const address = governorate
            ? [extractedAddress, rawAddress].filter(Boolean).join(', ')
            : rawAddress;

        // Get payment method (orders only)
        const paymentMethod = node.payments?.[0]?.source?.payment_gateway?.prototype?.key || 'unknown';

        // Normalize items
        const items = node.items.map((item: any) => ({
            name: item.title || item.name || 'Unknown Product',
            quantity: 1,
            price: item.price || 0,
            sku: item.sku,
            image_url: item.image?.path,
            product_id: item.product_id,
        }));

        // Calculate total (checkouts don't have total field)
        const total = node.total || items.reduce((sum: number, item: any) => sum + item.price, 0);

        // Checkout detection
        const isCheckout = isCheckoutFormat ||
            node.__typename === 'Checkout' ||
            (node.id && String(node.id).startsWith('checkout_'));

        const normalized: LightFunnelsWebhook = {
            order_id: String(node._id || node.id),
            order_number: node.name || String(node._id || node.id),
            is_checkout: isCheckout,
            customer: {
                name: customerName.trim(),
                phone: phone,
                email: node.email || node.shipping_address?.email,
                city: city,
                address: address,
            },
            items,
            total: total,
            created_at: node.created_at,
            notes: node.notes,
            payment_method: paymentMethod,
        };

        console.log("Parsed:", normalized.is_checkout ? "Checkout" : "Order", normalized.order_number);
        return normalized;
    } catch (error) {
        // Rethrow validation string errors, log others
        if (error instanceof Error && (
            error.message.startsWith('Missing') ||
            error.message.startsWith('Invalid') ||
            error.message === 'is_test_payload'
        )) {
            throw error;
        }
        console.error("Error parsing webhook payload:", error);
        throw new Error(`parsing failed: ${error instanceof Error ? error.message : String(error)}`);
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
 * Find product by SKU for linking, with fallback to name matching
 */
async function findProductBySku(sku: string | undefined, lightfunnelsName: string): Promise<{
    id: string;
    name: string;
    image_url?: string;
    tag_color?: string;
} | null> {
    // First try exact SKU match
    if (sku) {
        const { data: skuMatch } = await supabase
            .from('products')
            .select('id, name, image_url, tag_color')
            .eq('sku', sku)
            .single();

        if (skuMatch) return skuMatch;
    }

    // Fallback: search for any local product whose name appears in the Lightfunnels product name
    // This handles cases like "عطر برسيفيرون الفاخر من باريس كورنر للرجال" containing "برسيفيرون"
    const { data: allProducts } = await supabase
        .from('products')
        .select('id, name, image_url, tag_color');

    if (allProducts) {
        // Find a product whose name is contained in the Lightfunnels name
        const match = allProducts.find(product =>
            lightfunnelsName.includes(product.name)
        );
        if (match) return match;
    }

    return null;
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
                const product = await findProductBySku(item.sku, item.name);
                return {
                    // Use local product name if found, otherwise use Lightfunnels name
                    name: product?.name || item.name,
                    quantity: item.quantity,
                    price: item.price,
                    sku: item.sku || undefined,
                    product_id: product?.id,
                    image_url: product?.image_url || item.image_url,
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
