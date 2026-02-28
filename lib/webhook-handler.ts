import { supabase } from "./supabase";
import { formatPhoneToStandard } from "./order-utils";
import { generateWhatsAppLink } from "./utils";
import { validateAddress, getAddressStatus, extractAndSeparateGovernorate } from "./address-validator";
import { fetchCheckoutById, getSavedAccessToken } from "./lightfunnels-api";
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
        secondary_phone?: string; // Secondary phone from custom field
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
        let node = payload.node || payload;

        // Handle case where node is just a string ID (e.g., checkout webhook sends { node: "ch_xxxxx" })
        if (typeof node === 'string') {
            const nodeId = node;
            console.log("Webhook received string node ID:", nodeId);
            if (nodeId.startsWith('ch_') || nodeId.startsWith('checkout_')) {
                throw new Error(`fetch_checkout:${nodeId}`);
            }
            // Try to treat as order ID
            throw new Error("is_test_payload");
        }

        // Handle case where node is a number (just a numeric ID)
        if (typeof node === 'number') {
            console.log("Webhook received numeric node ID:", node);
            throw new Error("is_test_payload");
        }

        const nodeKeys = Object.keys(node);

        // Check if this is a minimal checkout payload with a real ID (e.g., { id: "ch_xxx" })
        // Must check BEFORE the dummy detection since real checkout webhooks also have few keys
        const nodeId = node.id || node._id;
        const isRealCheckoutId = nodeId && typeof nodeId === 'string' && (nodeId.startsWith('ch_') || nodeId.startsWith('checkout_'));
        if (isRealCheckoutId && nodeKeys.length <= 4 && !node.items && !node.variants) {
            console.log("Minimal checkout payload with real ID, fetching from API:", nodeId);
            throw new Error(`fetch_checkout:${nodeId}`);
        }

        // Handle minimal/dummy payloads like { node: { id: null } } or { node: { id: "" } }
        // Lightfunnels sends these as "Send dummy" test webhooks
        if (nodeKeys.length <= 2 && !node.items && !node.variants && !node.phone && !node.customer && !isRealCheckoutId) {
            console.log("Detected dummy/test webhook payload. Node keys:", nodeKeys.join(', '), "Values:", JSON.stringify(node));
            throw new Error("is_test_payload");
        }

        // Detect checkout format: has first_name at root or step_id (checkout-specific)
        // Also check if id/node.id starts with 'ch_'
        const checkoutId = (node.id || node._id || payload.id || payload._id);
        const isCheckoutId = typeof checkoutId === 'string' && (checkoutId.startsWith('ch_') || checkoutId.startsWith('checkout_'));

        const isCheckoutFormat = !payload.node && (node.first_name !== undefined || node.step_id !== undefined || isCheckoutId);

        console.log("Webhook type:", isCheckoutFormat ? "Checkout" : "Order", "ID:", checkoutId, "Node keys:", nodeKeys.join(', '));

        // Validate required fields
        if (checkoutId == null) {
            // If node looks like a checkout (has checkout-specific fields), try to fetch by any available identifier
            if (node.__typename === 'Checkout' || node.variants || node.step_id !== undefined) {
                console.log("Checkout webhook without ID, node keys:", nodeKeys.join(', '));
                // Can't fetch without ID, but acknowledge receipt
                throw new Error("is_test_payload");
            }
            const msg = `Missing order/checkout ID in webhook payload. Payload keys: ${Object.keys(payload).join(', ')}, Node keys: ${nodeKeys.join(', ')}`;
            console.error(msg);
            throw new Error(msg);
        }

        // Check if this is a minimal/incomplete payload (checkout notification with just ID)
        // Lightfunnels checkout/created webhook often only sends the ID - we need to fetch full data from API
        const hasMinimalData = nodeKeys.length <= 4 && !node.items && !node.variants;

        if (hasMinimalData || (isCheckoutId && !node.items && !node.variants)) {
            console.log("Detected minimal payload, triggering API fetch for:", checkoutId);
            // Always try to fetch checkout data from API when payload is minimal
            throw new Error(`fetch_checkout:${checkoutId}`);
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

        // Checkouts use 'variants' array, orders use 'items' array
        const hasItems = node.items && Array.isArray(node.items) && node.items.length > 0;
        const hasVariants = node.variants && Array.isArray(node.variants) && node.variants.length > 0;
        if (!hasItems && !hasVariants) {
            const msg = `Invalid or empty items/variants array. Items type: ${typeof node.items}, Variants type: ${typeof node.variants}`;
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

        // Extract secondary phone from custom fields or other sources
        // Lightfunnels stores custom checkout fields in the 'custom' JSON field
        let secondaryPhone: string | undefined;
        try {
            // Parse custom field if it's a JSON string
            const customData = typeof node.custom === 'string'
                ? JSON.parse(node.custom || '{}')
                : (node.custom || {});

            // Look for common secondary phone field names  
            secondaryPhone = customData.secondary_phone ||
                customData.phone2 ||
                customData['رقم الهاتف الثاني'] ||
                customData['هاتف ثاني'] ||
                customData.alt_phone ||
                customData.backup_phone;
        } catch {
            // Ignore JSON parse errors
        }

        // Also check if shipping/billing have different phones
        // Lightfunnels sends flat format: shipping_address_phone, billing_address_phone
        // And also nested format: shipping_address.phone
        if (!secondaryPhone) {
            const shippingPhone = node.shipping_address_phone || node.shipping_address?.phone;
            const billingPhone = node.billing_address_phone || node.billing_address?.phone;
            // If shipping/billing phone exists and different from primary, use as secondary
            if (shippingPhone && shippingPhone !== phone) {
                secondaryPhone = shippingPhone;
            } else if (billingPhone && billingPhone !== phone) {
                secondaryPhone = billingPhone;
            }
        }

        // Normalize phone (remove spaces/dashes)
        const normalizePhone = (p: string) => p?.replace(/[-\s]/g, '').trim();
        const normalizedPrimary = normalizePhone(phone);
        const normalizedSecondary = secondaryPhone ? normalizePhone(secondaryPhone) : undefined;

        // Skip secondary if it's the same as primary
        if (normalizedSecondary && normalizedSecondary === normalizedPrimary) {
            secondaryPhone = undefined;
        }

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

        // Normalize items - handle both order (items) and checkout (variants) formats
        let items;
        if (hasVariants && !hasItems) {
            // Checkout format: variants array with { quantity, variant: { title, price, ... } }
            items = node.variants.map((v: any) => ({
                name: v.variant?.title || v.variant?.name || 'Unknown Product',
                quantity: v.quantity || 1,
                price: v.variant?.price || 0,
                sku: v.variant?.sku,
                image_url: v.variant?.image?.path,
                product_id: v.variant?.product_id,
            }));
        } else {
            // Order format: flat items array
            items = node.items.map((item: any) => ({
                name: item.title || item.name || 'Unknown Product',
                quantity: 1,
                price: item.price || 0,
                sku: item.sku,
                image_url: item.image?.path,
                product_id: item.product_id,
            }));
        }

        // Calculate total (checkouts don't have total field)
        const total = node.total || items.reduce((sum: number, item: any) => sum + item.price, 0);

        // Checkout detection
        const isCheckout = isCheckoutFormat ||
            node.__typename === 'Checkout' ||
            (node.id && String(node.id).startsWith('checkout_')) ||
            (hasVariants && !hasItems);

        const normalized: LightFunnelsWebhook = {
            order_id: String(node._id || node.id),
            order_number: node.name || String(node._id || node.id),
            is_checkout: isCheckout,
            customer: {
                name: customerName.trim(),
                phone: phone,
                secondary_phone: secondaryPhone,
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
            error.message.startsWith('fetch_checkout:') ||
            error.message === 'is_test_payload'
        )) {
            throw error;
        }
        console.error("Error parsing webhook payload:", error);
        throw new Error(`parsing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Parse checkout data from API into LightFunnelsWebhook format
 * Used when we receive a minimal checkout payload and fetch full data from API
 */
export function parseCheckoutToWebhook(checkout: any): LightFunnelsWebhook | null {
    try {
        if (!checkout || (!checkout.variants || checkout.variants.length === 0)) {
            console.error("Invalid checkout data: missing variants");
            return null;
        }

        // Get customer name from full_name (first_name/last_name not available on Checkout type)
        const customerName = checkout.customer?.full_name
            || 'Unknown Customer';

        // Get phone - primary from root or shipping
        const phone = checkout.phone
            || checkout.shipping_address?.phone
            || checkout.billing_address?.phone
            || checkout.customer?.phone
            || '';

        // Get secondary phone
        let secondaryPhone: string | undefined;
        const shippingPhone = checkout.shipping_address?.phone;
        const billingPhone = checkout.billing_address?.phone;
        if (shippingPhone && shippingPhone !== phone) {
            secondaryPhone = shippingPhone;
        } else if (billingPhone && billingPhone !== phone) {
            secondaryPhone = billingPhone;
        }

        // Get city and address
        const city = checkout.shipping_address?.city || '';
        const address = [
            checkout.shipping_address?.line1,
            checkout.shipping_address?.line2,
            checkout.shipping_address?.area,
        ].filter(Boolean).join(', ');

        // Map items - Checkouts via API return 'variants' array
        const items = (checkout.variants || []).map((v: any) => {
            const item = v.variant;
            return {
                name: item.title || item.name || 'Unknown Product',
                quantity: v.quantity || 1,
                price: item.price || 0,
                sku: item.sku,
                image_url: item.image?.path,
                product_id: item.product_id,
            };
        });

        // Calculate total
        const total = checkout.total || items.reduce((sum: number, item: any) => sum + item.price, 0);

        return {
            order_id: String(checkout._id || checkout.id),
            order_number: String(checkout._id || checkout.id),
            is_checkout: true,
            customer: {
                name: customerName,
                phone: phone,
                secondary_phone: secondaryPhone,
                email: checkout.email,
                city: city,
                address: address,
            },
            items,
            total,
            created_at: checkout.created_at,
            notes: undefined,
            payment_method: 'cod', // Checkouts are typically COD
        };
    } catch (error) {
        console.error("Error parsing checkout:", error);
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
 * Normalize Arabic text for fuzzy matching
 * Handles common spelling variations in Arabic product names
 */
function normalizeArabicText(text: string): string {
    return text
        // Remove diacritics (tashkeel)
        .replace(/[\u064B-\u065F]/g, '')
        // Normalize alef variations
        .replace(/[أإآ]/g, 'ا')
        // Normalize teh marbuta and heh
        .replace(/ة/g, 'ه')
        // Normalize yeh variations  
        .replace(/ى/g, 'ي')
        // Remove common filler words
        .replace(/عطر|الفاخر|من|باريس|كورنر|للرجال|للنساء/g, '')
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract core product keyword from Lightfunnels name
 * Returns the most distinctive word that's likely the product name
 */
function extractCoreKeyword(lightfunnelsName: string): string {
    const normalized = normalizeArabicText(lightfunnelsName);
    // Split and find the longest word (usually the product name)
    const words = normalized.split(' ').filter(w => w.length > 3);
    return words.length > 0 ? words.reduce((a, b) => a.length >= b.length ? a : b) : normalized;
}

/**
 * Find product by SKU for linking, with fallback to name matching
 * Uses multiple strategies for robust Arabic text matching
 */
async function findProductBySku(sku: string | undefined, lightfunnelsName: string): Promise<{
    id: string;
    name: string;
    image_url?: string;
    tag_color?: string;
} | null> {
    // Strategy 1: Exact SKU match
    if (sku) {
        const { data: skuMatch } = await supabase
            .from('products')
            .select('id, name, image_url, tag_color')
            .eq('sku', sku)
            .single();

        if (skuMatch) return skuMatch;
    }

    // Fetch all products once for matching strategies
    const { data: allProducts } = await supabase
        .from('products')
        .select('id, name, image_url, tag_color, lightfunnels_aliases');

    if (!allProducts || allProducts.length === 0) return null;

    // Strategy 2: Check lightfunnels_aliases array
    // This is the most reliable method if aliases are configured
    for (const product of allProducts) {
        const aliases = (product as any).lightfunnels_aliases as string[] | null;
        if (aliases && aliases.length > 0) {
            // Check if Lightfunnels name contains any alias
            const matchedByAlias = aliases.some(alias =>
                lightfunnelsName.includes(alias) || alias.includes(lightfunnelsName)
            );
            if (matchedByAlias) {
                return {
                    id: product.id,
                    name: product.name,
                    image_url: product.image_url,
                    tag_color: product.tag_color,
                };
            }
        }
    }

    // Strategy 3: Direct substring match (original logic)
    // Product name is contained within Lightfunnels name
    const directMatch = allProducts.find(product =>
        lightfunnelsName.includes(product.name)
    );
    if (directMatch) return directMatch;

    // Strategy 4: Normalized Arabic matching
    // Handle common spelling variations (برسيفيرون vs بيرسيفيرون)
    const normalizedLF = normalizeArabicText(lightfunnelsName);
    const coreKeyword = extractCoreKeyword(lightfunnelsName);

    for (const product of allProducts) {
        const normalizedProductName = normalizeArabicText(product.name);

        // Check if normalized names overlap significantly
        if (normalizedLF.includes(normalizedProductName) ||
            normalizedProductName.includes(coreKeyword) ||
            coreKeyword.includes(normalizedProductName)) {
            return {
                id: product.id,
                name: product.name,
                image_url: product.image_url,
                tag_color: product.tag_color,
            };
        }
    }

    // Strategy 5: Fuzzy matching with character-level similarity
    // For cases where normalization alone doesn't work
    for (const product of allProducts) {
        // Check if product name characters appear in sequence within LF name
        // This catches cases like "بيرسيفيرون" matching "برسيفيرون"
        const productChars = product.name.replace(/\s/g, '');
        const lfChars = lightfunnelsName.replace(/\s/g, '');

        // Count matching characters (allowing for some insertions/deletions)
        let matchCount = 0;
        let lfIndex = 0;
        for (const char of productChars) {
            const foundAt = lfChars.indexOf(char, lfIndex);
            if (foundAt !== -1) {
                matchCount++;
                lfIndex = foundAt + 1;
            }
        }

        // If 80%+ of product name characters found in sequence, it's a match
        const matchRatio = matchCount / productChars.length;
        if (matchRatio >= 0.8 && productChars.length >= 4) {
            return {
                id: product.id,
                name: product.name,
                image_url: product.image_url,
                tag_color: product.tag_color,
            };
        }
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
        // Format secondary phone if present (skip if same as primary)
        const formattedSecondaryPhone = webhook.customer.secondary_phone
            ? formatPhoneToStandard(webhook.customer.secondary_phone)
            : null;

        const orderData = {
            order_id: orderId,
            customer_name: webhook.customer.name.trim(),
            phone: formattedPhone,
            secondary_phone: formattedSecondaryPhone !== formattedPhone ? formattedSecondaryPhone : null,
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
