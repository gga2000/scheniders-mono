import { createSupabaseServiceClient } from "./supabase-server";
import { formatPhoneToStandard } from "./order-utils";
import { generateWhatsAppLink } from "./utils";
import { validateAddress, getAddressStatus, extractAndSeparateGovernorate } from "./address-validator";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { fetchCheckoutById, fetchOrderAttributionById, getSavedAccessToken } from "./lightfunnels-api";
import { parseAdAttribution, type AdAttribution, type UtmPair } from "./ad-attribution";
import { fraudDetector } from "./fraud-detector";
import type { OrderItem } from "./supabase";

// Use service role client — this file is server-only (called from webhook routes)
// Lazy init so env vars are available at call time, not import time
let _supabase: ReturnType<typeof createSupabaseServiceClient> | null = null;
function getSupabase() {
    if (!_supabase) _supabase = createSupabaseServiceClient();
    return _supabase;
}
 
const supabase = new Proxy({} as ReturnType<typeof createSupabaseServiceClient>, {
    get(_, prop) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (getSupabase() as any)[prop];
    }
});

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
        checkout?: {
            _id?: number; // The original checkout ID if this order came from a checkout
        };
        /** Ad attribution pairs: [{k:"source",v:"fb"},{k:"medium",v:"Facebook_Mobile_Reels"},…] */
        utm?: UtmPair[];
    };
}

/**
 * Normalized webhook data for internal use
 */
export interface LightFunnelsWebhook {
    order_id: string;
    order_number: string;
    /** LightFunnels global node id ("order_hnIxTFem…"), for API follow-ups. */
    lf_node_id?: string;
    is_checkout: boolean; // true if this is an abandoned checkout, false if completed order
    checkout_id?: string; // The original checkout ID if this order came from a checkout
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
    /** Which ad channel the customer came from, when the payload carried it. */
    attribution?: AdAttribution;
}

/**
 * Parse and validate LightFunnels webhook payload (handles both order and checkout formats)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseLightFunnelsPayload(payload: any): LightFunnelsWebhook | null {
    try {
        // Check if payload has the node wrapper (order automation format)
        // eslint-disable-next-line prefer-const
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
        console.log("[parseWebhook] node.name:", node.name, "node._id:", node._id, "node.id:", node.id);

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const total = node.total || items.reduce((sum: number, item: any) => sum + item.price, 0);

        // Checkout detection
        const isCheckout = isCheckoutFormat ||
            node.__typename === 'Checkout' ||
            (node.id && String(node.id).startsWith('checkout_')) ||
            (hasVariants && !hasItems);

        // Extract checkout ID if this order came from a checkout
        const originalCheckoutId = node.checkout?._id ? String(node.checkout._id) : undefined;

        const normalized: LightFunnelsWebhook = {
            order_id: String(node._id || node.id),
            order_number: node.name || String(node._id || node.id),
            lf_node_id: typeof node.id === 'string' ? node.id : undefined,
            is_checkout: isCheckout,
            checkout_id: originalCheckoutId,
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
            // Absent when the webhook payload omits `utm`; the caller then asks the
            // API for it rather than losing the channel.
            attribution: parseAdAttribution(node.utm),
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        const rawCity = checkout.shipping_address?.city || '';
        const rawAddress = [
            checkout.shipping_address?.line1,
            checkout.shipping_address?.line2,
            checkout.shipping_address?.area,
        ].filter(Boolean).join(', ');

        const { governorate, city: extractedCity, remainingAddress: extractedAddress } = extractAndSeparateGovernorate(rawCity);

        const city = governorate ? extractedCity : rawCity;
        const address = governorate
            ? [extractedAddress, rawAddress].filter(Boolean).join(', ')
            : rawAddress;

        // Map items - Checkouts via API return 'variants' array
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // A checkout carries the same `utm` list an order does. Skipping it
            // here is why every order recovered from a checkout arrived with no
            // channel.
            attribution: parseAdAttribution(checkout.utm),
        };
    } catch (error) {
        console.error("Error parsing checkout:", error);
        return null;
    }
}

/**
 * Ask LightFunnels for an order's UTM pairs when the webhook payload carried none.
 *
 * Only orders have a node id to look up; a checkout's attribution comes from the
 * checkout record itself (parseCheckoutToWebhook). fetchOrderAttributionById
 * already logs and returns null on API failure, and a missing token simply means
 * there is nothing to ask — in both cases the order lands without a channel.
 */
async function resolveMissingAttribution(webhook: LightFunnelsWebhook): Promise<AdAttribution | undefined> {
    if (!webhook.lf_node_id) return undefined;
    const token = await getSavedAccessToken(supabase);
    if (!token) return undefined;
    const utm = await fetchOrderAttributionById(webhook.lf_node_id, token);
    return parseAdAttribution(utm);
}

/**
 * Check if a phone number is on `tenantId`'s blacklist. This runs on the
 * service-role client, so RLS does not scope it: without the tenant filter one
 * merchant's blacklist silently dropped another merchant's orders.
 */
export async function checkBlacklist(phone: string, tenantId: string): Promise<{ isBlacklisted: boolean; reason?: string }> {
    try {
        const formattedPhone = formatPhoneToStandard(phone);

        const { data, error } = await supabase
            .from("blacklist")
            .select("reason")
            .eq("tenant_id", tenantId)
            .eq("phone", formattedPhone)
            .limit(1)
            .maybeSingle();

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
 * Find one of `tenantId`'s products by SKU for linking, with fallback to name
 * matching. Uses multiple strategies for robust Arabic text matching.
 *
 * Service-role client, so RLS does not scope it: without the tenant filter an
 * order could be bound to — and decrement the stock of — another merchant's
 * product with a similar name.
 */
async function findProductBySku(sku: string | undefined, lightfunnelsName: string, tenantId: string): Promise<{
    id: string;
    name: string;
    short_name?: string | null;
    image_url?: string;
    tag_color?: string;
} | null> {
    // Strategy 1: Exact SKU match
    if (sku) {
        const { data: skuMatch } = await supabase
            .from('products')
            .select('id, name, short_name, image_url, tag_color')
            .eq('tenant_id', tenantId)
            .eq('sku', sku)
            .single();

        if (skuMatch) return skuMatch;
    }

    // Fetch the tenant's products once for matching strategies
    const { data: allProducts } = await supabase
        .from('products')
        .select('id, name, short_name, image_url, tag_color, lightfunnels_aliases')
        .eq('tenant_id', tenantId);

    if (!allProducts || allProducts.length === 0) return null;

    // Strategy 2: Check lightfunnels_aliases array
    // This is the most reliable method if aliases are configured
    for (const product of allProducts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                    short_name: product.short_name,
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
                short_name: product.short_name,
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
                short_name: product.short_name,
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
export async function createOrderFromWebhook(webhook: LightFunnelsWebhook, tenantId?: string | null) {
    // Every lookup below runs on the service-role client, where RLS does not
    // apply, so each must be filtered by the tenant. With no tenant there is
    // nothing safe to filter by, and the order would be created with a NULL
    // tenant_id that no merchant can see.
    if (!tenantId) {
        console.error(`[createOrderFromWebhook] No tenant for order ${webhook.order_number}`);
        return { success: false, error: "No tenant configured for this webhook" };
    }

    try {
        // Format phone number
        const formattedPhone = formatPhoneToStandard(webhook.customer.phone);

        // Check blacklist
        const blacklistResult = await checkBlacklist(formattedPhone, tenantId);
        if (blacklistResult.isBlacklisted) {
            return {
                success: false,
                error: "Customer is blacklisted",
                reason: blacklistResult.reason,
            };
        }

        // --- NEW LOGIC FOR ABANDONED CHECKOUT DEDUPLICATION ---
        // If this is an abandoned checkout being processed, check if a real order
        // has already been created for this phone number in the last 24 hours.
        if (webhook.is_checkout && formattedPhone) {
            const now = new Date();
            const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

            // Same tenant only: a real order for this phone in ANOTHER tenant
            // says nothing about this merchant's abandoned checkout.
            const { data: existingRealOrders, error: checkErr } = await supabase
                .from("orders")
                .select("id")
                .eq("tenant_id", tenantId)
                .eq("phone", formattedPhone)
                .neq("status", "pending_checkout")
                .gte("created_at", windowStart)
                .limit(1);

            if (!checkErr && existingRealOrders && existingRealOrders.length > 0) {
                console.log(`[Deduplication] Dropping abandoned checkout ${webhook.order_id || webhook.order_number} to prevent duplicate. Real order exists for phone: ${formattedPhone}`);
                return {
                    success: false,
                    error: "A real order already exists; skipping abandoned checkout.",
                    duplicate: true, // This tells the queue processor to mark it as processed and not retry
                };
            }
        }
        // ----------------------------------------------------

        // Use Lightfunnels order ID directly
        const lightfunnelsOrderId = webhook.order_number;
        console.log('[createOrderFromWebhook] order_id being sent to RPC:', lightfunnelsOrderId, '(webhook.order_id:', webhook.order_id, ', webhook.order_number:', webhook.order_number, ')');

        // Check for duplicate by order_id. Deliberately NOT tenant-filtered:
        // orders.order_id carries a table-wide UNIQUE constraint
        // (orders_order_id_key), so the insert would fail on any tenant's row.
        // Only the id is read.
        const { data: existingOrder } = await supabase
            .from("orders")
            .select("id")
            .eq("order_id", lightfunnelsOrderId)
            .limit(1);

        if (existingOrder && existingOrder.length > 0) {
            return {
                success: false,
                error: "Order already exists",
                duplicate: true,
            };
        }

        // Map items with SKU for product matching
        const items: OrderItem[] = await Promise.all(
            webhook.items.map(async (item) => {
                const product = await findProductBySku(item.sku, item.name, tenantId);

                // CRITICAL FIX: Use local product data when matched
                // This ensures we use our app's short names and images, not LightFunnels' full titles
                if (product) {
                    return {
                        // Snapshot the internal ops name (e.g., "برسيفيرون" instead of
                        // "عطر برسيفيرون الفاخر من باريس كورنر للرجال"). products.name is the
                        // customer-facing marketing title; products.short_name is what
                        // employees read on orders, printing, labels and WhatsApp templates.
                        name: product.short_name?.trim() || product.name,
                        quantity: item.quantity,
                        price: item.price,
                        sku: item.sku || undefined,
                        product_id: product.id,
                        image_url: product.image_url, // Use our local image
                        tag_color: product.tag_color,
                    };
                }

                // Fallback to LightFunnels data only if no product match found
                return {
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    sku: item.sku || undefined,
                    product_id: undefined,
                    image_url: item.image_url,
                    tag_color: undefined,
                };
            })
        );

        // Validate customer address
        const addressValidation = validateAddress(
            webhook.customer.city,
            undefined, // Lightfunnels doesn't provide governorate code
            webhook.customer.address
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const addressStatus = getAddressStatus(addressValidation);

        // Determine if order needs attention due to address issues
        const hasAddressIssues = !addressValidation.isValid;
        const attentionReasons: string[] = [];
        if (hasAddressIssues) {
            attentionReasons.push('address_issue');
        }

        // Assess customer risk (fraud detection) before creating order
        // This checks for previous rejections and adds attention flags.
        //
        // The service-role client and the tenant are passed explicitly: this runs
        // with no user session, so the browser client this used to fall back on
        // failed every lookup with `42501: permission denied for function
        // get_user_tenant_ids` and quietly returned a default assessment. The
        // effect was that `previous_rejection` was never flagged on an incoming
        // order, no matter how many deliveries that customer had refused.
        const riskAssessment = await fraudDetector.assessCustomerTrust(formattedPhone, {
            client: supabase,
            tenantId,
        });

        // Add attention flags for high-risk customers with previous rejections
        if (riskAssessment.historicalData.rejectedCustomerFaultCount > 0) {
            attentionReasons.push('previous_rejection');
        }

        // Determine order status based on type
        const orderStatus = webhook.is_checkout ? 'pending_checkout' : 'new';

        // Build WhatsApp message based on type
        // Note: We'll use the generated order_id in the message after creation
        const whatsappMessage = webhook.is_checkout
            ? `مرحباً ${webhook.customer.name}، لاحظنا أنك لم تكمل طلبك. هل تحتاج مساعدة؟`
            : `مرحباً ${webhook.customer.name}، شكراً لطلبك`;

        // Prepare order data (only include fields that exist in the database)
        // Format secondary phone if present (skip if same as primary)
        const formattedSecondaryPhone = webhook.customer.secondary_phone
            ? formatPhoneToStandard(webhook.customer.secondary_phone)
            : null;

        // Build notes (add checkout indicator if needed)
        const notesText = webhook.is_checkout
            ? `[سلة متروكة] ${webhook.notes?.trim() || ''}`.trim()
            : webhook.notes?.trim() || null;

        // Ad attribution: prefer what the webhook already carried, otherwise ask the
        // API. Losing the channel is worse than one extra request, and a failure
        // here must never stop the order from landing.
        const attribution = webhook.attribution ?? await resolveMissingAttribution(webhook);

        const orderData = {
            // Use Lightfunnels order ID directly
            order_id: lightfunnelsOrderId,
            customer_name: webhook.customer.name.trim(),
            phone: formattedPhone,
            secondary_phone: formattedSecondaryPhone !== formattedPhone ? formattedSecondaryPhone : null,
            city: webhook.customer.city?.trim() || null,
            governorate_code: addressValidation.governorate?.code || null,
            address_details: webhook.customer.address?.trim() || null,
            items,
            price: webhook.total,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            status: orderStatus as any,
            priority: "normal" as const,
            payment_status: webhook.payment_method === 'cod' ? 'cod' as const : 'pending' as const,
            is_return: false,
            is_archived: false,
            source: 'lightfunnels' as const,
            // `source` says which system sent the order; these say which ad the
            // customer actually clicked. create_order_atomic whitelists both
            // columns (migration 20260912101600).
            attribution: attribution ?? null,
            ad_channel: attribution?.channel ?? null,
            whatsapp_link: generateWhatsAppLink(formattedPhone, whatsappMessage),
            notes: notesText,
            needs_attention: attentionReasons.length > 0,
            attention_reasons: attentionReasons.length > 0 ? attentionReasons : null,
        };

        // Use atomic RPC to create order with Lightfunnels order ID
        const { data, error } = await supabase
            .rpc('create_order_atomic', { _order_data: orderData, _tenant_id: tenantId });

        if (error) {
            console.error("Error creating order:", error);
            return {
                success: false,
                error: error.message,
            };
        }

        console.log(`Order created successfully: ${webhook.order_number}`);

        // A real order (not a checkout) supersedes the customer's abandoned
        // checkouts for the same tenant — soft-delete them.
        if (!webhook.is_checkout && formattedPhone) {
            await cleanupAbandonedCheckouts(supabase, {
                tenantId,
                phone: formattedPhone,
                checkoutId: webhook.checkout_id,
                orderNumber: webhook.order_number,
            });
        }

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
 * Soft-delete the abandoned LightFunnels checkouts a real order supersedes.
 *
 * Priority 1: the exact checkout id the order came from.
 * Priority 2: same phone within the last 24 hours (when no id is available).
 *
 * Every query is scoped to `tenantId`. This runs on the service-role client, so
 * RLS does not apply: before the scope was added, an order for a phone number
 * soft-deleted that number's pending checkouts in EVERY tenant — and the
 * LightFunnels webhook could be called without credentials, so anyone could
 * erase another merchant's checkouts by posting an order with their
 * customer's phone.
 *
 * Non-fatal by design: the order already exists, so a cleanup failure is
 * logged rather than turned into a failed webhook delivery (which LightFunnels
 * would retry, re-running order creation).
 */
export async function cleanupAbandonedCheckouts(
    client: Pick<ReturnType<typeof createSupabaseServiceClient>, "from">,
    args: { tenantId: string; phone: string; checkoutId?: string; orderNumber: string },
): Promise<{ method: "exact_checkout_id" | "phone_time_window" | null; deleted: string[] }> {
    const { tenantId, phone, checkoutId, orderNumber } = args;

    let matches: Array<{ id: string; order_id: string }> = [];
    let method: "exact_checkout_id" | "phone_time_window" | null = null;

    if (checkoutId) {
        const { data, error } = await client
            .from("orders")
            .select("id, order_id")
            .eq("tenant_id", tenantId)
            .eq("order_id", checkoutId)
            .eq("status", "pending_checkout")
            .eq("source", "lightfunnels");
        if (error) {
            console.error(`[Cleanup] Exact checkout lookup failed for ${checkoutId}:`, error);
        } else if (data && data.length > 0) {
            matches = data;
            method = "exact_checkout_id";
        }
    }

    if (matches.length === 0) {
        const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await client
            .from("orders")
            .select("id, order_id")
            .eq("tenant_id", tenantId)
            .eq("status", "pending_checkout")
            .eq("phone", phone)
            .eq("source", "lightfunnels")
            .gte("created_at", windowStart);
        if (error) {
            console.error(`[Cleanup] Phone checkout lookup failed for order ${orderNumber}:`, error);
        } else if (data && data.length > 0) {
            matches = data;
            method = "phone_time_window";
        }
    }

    if (matches.length === 0) {
        console.log(`[Cleanup] No abandoned checkouts found to clean up for order ${orderNumber}`);
        return { method: null, deleted: [] };
    }

    const { error: deleteErr } = await client
        .from("orders")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .in("id", matches.map(m => m.id));
    if (deleteErr) {
        console.error(`[Cleanup] Soft-delete failed for order ${orderNumber}:`, deleteErr);
        return { method, deleted: [] };
    }

    const deleted = matches.map(m => m.order_id);
    console.log(`[Cleanup] Soft-deleted ${deleted.length} abandoned checkout(s) via ${method}:`, deleted.join(", "));
    return { method, deleted };
}

/**
 * Log webhook request for debugging
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logWebhookRequest(payload: any, result: any) {
    const timestamp = new Date().toISOString();
    console.log("=== WEBHOOK REQUEST ===");
    console.log("Timestamp:", timestamp);
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("Result:", JSON.stringify(result, null, 2));
    console.log("=====================");
}
