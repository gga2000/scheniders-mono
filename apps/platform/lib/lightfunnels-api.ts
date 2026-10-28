/**
 * Lightfunnels GraphQL API Client
 * 
 * Connects to Lightfunnels API to fetch orders and products.
 * API Docs: https://developers.lightfunnels.com
 */

import { providerBaseUrls } from './env';
import { createSupabaseServiceClient } from './supabase-server';
import { formatPhoneToStandard } from './order-utils';
import { generateWhatsAppLink } from './utils';
import type { Order, OrderItem } from './supabase';

// Use service role client — this file is server-only (called from webhook/cron/sync routes)
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

// API Configuration
const LIGHTFUNNELS_API_URL = `${providerBaseUrls.LIGHTFUNNELS_API_BASE_URL}/api/v2`;

/**
 * Lightfunnels Order structure from API
 */
export interface LightfunnelsOrder {
    id: string;
    _id: number; // Numeric ID
    name: string; // Order name like "#1001"
    total: number;
    subtotal?: number;
    fulfillment_status: 'unfulfilled' | 'fulfilled' | 'partially_fulfilled';
    financial_status: 'pending' | 'paid' | 'refunded' | 'partially_refunded';
    created_at: string;
    updated_at?: string;
    notes?: string;
    customer: {
        id: string;
        full_name: string;
        email?: string;
        phone?: string;
    };
    items: Array<{
        id: string;
        _id: number;
        title: string;
        price: number;
        sku?: string;
        product_id?: string;
        quantity?: number;
    }>;
    checkout?: {
        _id?: number;
        variants: Array<{
            quantity: number;
            variant: {
                id: string;
                _id: number;
                title: string;
                price: number;
                sku?: string;
                product_id?: string;
            };
        }>;
    };
    shipping_address?: {
        line1?: string;
        line2?: string;
        city?: string;
        area?: string;
        country?: string;
        phone?: string;
    };
    /** Ad attribution pairs — see lib/ad-attribution.ts. */
    utm?: Array<{ k?: string | null; v?: string | null }>;
}

/**
 * API Response wrapper
 */
interface GraphQLResponse<T> {
    data?: T;
    errors?: Array<{ message: string }>;
}

/**
 * Import result for a single order
 */
export interface OrderImportResult {
    lightfunnelsId: string;
    orderName: string;
    status: 'imported' | 'duplicate' | 'error';
    message?: string;
    localOrderId?: string;
}

export interface SyncSummary {
    total: number;
    imported: number;
    duplicates: number;
    errors: number;
    results: OrderImportResult[];
}

/**
 * Common options for synchronization
 */
export interface SyncOptions {
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    cursor?: string;
}

/**
 * Execute a GraphQL query against Lightfunnels API
 */
async function executeQuery<T>(
    query: string,
    variables: Record<string, unknown> = {},
    accessToken: string
): Promise<T> {
    const response = await fetch(LIGHTFUNNELS_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const result: GraphQLResponse<T> = await response.json();

    if (result.errors && result.errors.length > 0) {
        throw new Error(`GraphQL Error: ${result.errors[0].message}`);
    }

    if (!result.data) {
        throw new Error('No data returned from API');
    }

    return result.data;
}

/**
 * GraphQL query to fetch orders
 */
const ORDERS_QUERY = `
query ordersQuery($first: Int, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query) {
        edges {
            node {
                id
                _id
                name
                total
                subtotal
                fulfillment_status
                financial_status
                created_at
                updated_at
                notes
                customer {
                    id
                    full_name
                    email
                    phone
                }
                items {
                    ... on VariantSnapshot {
                        id
                        _id
                        title
                        price
                        sku
                        product_id
                    }
                    ... on OrderBumpSnapshot {
                        id
                        _id
                        title
                        price
                        sku
                        product_id
                    }
                }
                checkout {
                    _id
                    variants {
                        quantity
                        variant {
                            id
                            title
                            price
                            sku
                            product_id
                        }
                    }
                }
                shipping_address {
                    line1
                    line2
                    city
                    area
                    country
                    phone
                }
                utm {
                    k
                    v
                }
            }
        }
        pageInfo {
            hasNextPage
            endCursor
        }
    }
}
`;

/**
 * Query to test connection - uses a minimal orders query since account.stores is not in the schema
 */
const STORE_INFO_QUERY = `
query ordersQuery($first: Int, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query) {
        edges {
            node {
                id
                _id
                name
            }
        }
    }
}
`;

/**
 * Query to fetch a single checkout by ID
 */
const CHECKOUT_QUERY = `
query GetCheckout($id: ID!) {
    node(id: $id) {
        ... on Checkout {
            id
            _id
            utm {
                k
                v
            }
            phone
            email
            created_at(format: "YYYY-MM-DD HH:mm:ss")
            updated_at(format: "YYYY-MM-DD HH:mm:ss")
            total
            subtotal
            link
            recovered
            variants {
                quantity
                variant {
                    id
                    _id
                    title
                    price
                    sku
                    product_id
                    image {
                        path
                    }
                }
            }
            shipping_address {
                phone
                line1
                line2
                city
                country
                area
                zip
                state
            }
            billing_address {
                phone
                city
                country
            }
            customer {
                full_name
                phone
            }
        }
    }
}
`;

/**
 * Query to fetch multiple checkouts (abandoned orders)
 */
const CHECKOUTS_QUERY = `
    query checkoutsQuery($query: String!, $after: String, $first: Int) {
        checkouts(query: $query, after: $after, first: $first) {
            edges {
                node {
                    _id
                    id
                    utm {
                        k
                        v
                    }
                    created_at(format: "YYYY-MM-DD HH:mm:ss")
                    updated_at(format: "YYYY-MM-DD HH:mm:ss")
                    total
                    subtotal
                    email
                    phone
                    link
                    variants {
                        quantity
                        variant {
                            id
                            _id
                            title
                            price
                            sku
                            product_id
                            image {
                                path
                            }
                        }
                    }
                    shipping_address {
                        phone
                        line1
                        line2
                        city
                        country
                        area
                        zip
                        state
                    }
                    billing_address {
                        phone
                        city
                        country
                    }
                    customer {
                        full_name
                        phone
                    }
                }
            }
            pageInfo {
                hasNextPage
                endCursor
            }
        }
    }
`;

/**
 * Checkout data structure
 */
export interface LightfunnelsCheckout {
    id: string;
    _id: number;
    step_id?: string;
    created_at: string;
    total: number;
    subtotal?: number;
    email?: string;
    phone?: string;
    link?: string;
    variants: Array<{
        quantity: number;
        variant: {
            id: string;
            _id: number;
            title: string;
            price: number;
            sku?: string;
            product_id?: string;
            image?: { path: string };
        };
    }>;
    shipping_address?: {
        phone?: string;
        line1?: string;
        line2?: string;
        city?: string;
        country?: string;
        area?: string;
        zip?: string;
        state?: string;
    };
    billing_address?: {
        phone?: string;
        city?: string;
        country?: string;
    };
    customer?: {
        full_name?: string;
        phone?: string;
    };
    /** Ad attribution pairs — see lib/ad-attribution.ts. */
    utm?: Array<{ k?: string | null; v?: string | null }>;
}

/**
 * Fetch a checkout by ID from Lightfunnels API
 */
export async function fetchCheckoutById(
    checkoutId: string,
    accessToken: string
): Promise<LightfunnelsCheckout | null> {
    try {
        const data = await executeQuery<{ node: LightfunnelsCheckout | null }>(
            CHECKOUT_QUERY,
            { id: checkoutId },
            accessToken
        );
        return data.node;
    } catch (error) {
        console.error('Error fetching checkout:', error);
        return null;
    }
}

/**
 * Fetch just the ad attribution for one order.
 *
 * The webhook payload does not always carry `utm`, and losing the channel is
 * worse than one extra request — this asks LightFunnels for the pairs alone.
 * Returns null on any failure: attribution must never block an order landing.
 */
export async function fetchOrderAttributionById(
    orderNodeId: string,
    accessToken: string
): Promise<Array<{ k?: string | null; v?: string | null }> | null> {
    try {
        const data = await executeQuery<{ node: { utm?: Array<{ k?: string | null; v?: string | null }> } | null }>(
            `query GetOrderUtm($id: ID!) { node(id: $id) { ... on Order { utm { k v } } } }`,
            { id: orderNodeId },
            accessToken
        );
        return data.node?.utm ?? null;
    } catch (error) {
        console.error('[LF] Error fetching order attribution:', error);
        return null;
    }
}

/**
 * Test connection to Lightfunnels API
 */
export async function testConnection(accessToken: string): Promise<{
    success: boolean;
    storeName?: string;
    error?: string;
}> {
    try {
        // Use a minimal orders query to verify the token is valid and has order scope
        await executeQuery<{
            orders: { edges: Array<{ node: { id: string } }> }
        }>(
            STORE_INFO_QUERY,
            { first: 1, query: '' },
            accessToken
        );

        return {
            success: true,
            storeName: 'Lightfunnels Store',
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Fetch orders from Lightfunnels with pagination
 */
export async function fetchOrders(
    accessToken: string,
    options: {
        limit?: number;
        cursor?: string;
        dateFrom?: string;
        dateTo?: string;
    } = {}
): Promise<{
    orders: LightfunnelsOrder[];
    hasNextPage: boolean;
    endCursor?: string;
}> {
    const { limit = 50, cursor, dateFrom, dateTo } = options;

    // Build query filter for date range
    let query = '';
    if (dateFrom || dateTo) {
        const filters: string[] = [];

        // Lightfunnels URL uses YYYY/MM/DD HH:mm:ss in a range
        const start = dateFrom ? (dateFrom.includes('/') ? dateFrom : `${dateFrom.replace(/-/g, '/')} 00:00:00`) : '2020/01/01 00:00:00';
        const end = dateTo ? (dateTo.includes('/') ? dateTo : `${dateTo.replace(/-/g, '/')} 23:59:59`) : new Date().toISOString().split('T')[0].replace(/-/g, '/') + ' 23:59:59';

        filters.push(`created_at:"${start}-${end}"`);
        query = filters.join(' AND ');
    }

    const data = await executeQuery<{
        orders: {
            edges: Array<{ node: LightfunnelsOrder }>;
            pageInfo: { hasNextPage: boolean; endCursor?: string };
        };
    }>(
        ORDERS_QUERY,
        { first: limit, after: cursor, query: query || '' },
        accessToken
    );

    return {
        orders: data.orders.edges.map(edge => edge.node),
        hasNextPage: data.orders.pageInfo.hasNextPage,
        endCursor: data.orders.pageInfo.endCursor,
    };
}

/**
 * Fetch checkouts from Lightfunnels with pagination
 */
export async function fetchCheckouts(token: string, options?: SyncOptions): Promise<{
    checkouts: LightfunnelsCheckout[];
    hasNextPage: boolean;
    endCursor?: string;
}> {
    const { dateFrom, dateTo, limit = 50, cursor } = options || {};

    // Build query filter for date range
    const filters: string[] = [];

    if (dateFrom || dateTo) {
        const start = dateFrom ? (dateFrom.includes('/') ? dateFrom : `${dateFrom.replace(/-/g, '/')} 00:00:00`) : '2020/01/01 00:00:00';
        const end = dateTo ? (dateTo.includes('/') ? dateTo : `${dateTo.replace(/-/g, '/')} 23:59:59`) : new Date().toISOString().split('T')[0].replace(/-/g, '/') + ' 23:59:59';
        filters.push(`created_at:"${start}-${end}"`);
    }

    const query = filters.join(' AND ');

    const data = await executeQuery<{
        checkouts: {
            edges: Array<{ node: LightfunnelsCheckout }>;
            pageInfo: { hasNextPage: boolean; endCursor: string };
        };
    }>(CHECKOUTS_QUERY, { query, first: limit, after: cursor }, token);

    return {
        checkouts: data?.checkouts.edges.map(edge => edge.node) || [],
        hasNextPage: data?.checkouts.pageInfo.hasNextPage || false,
        endCursor: data?.checkouts.pageInfo.endCursor,
    };
}

/**
 * Check if order already exists in our database by order_id.
 *
 * Deliberately not tenant-filtered: orders.order_id carries a table-wide
 * UNIQUE constraint (orders_order_id_key), so any tenant's row would make the
 * insert fail. Only the id is read.
 */
async function checkOrderExists(lfOrderName: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('orders')
        .select('id')
        .eq('order_id', lfOrderName)
        .limit(1);

    return !!data && data.length > 0 && !error;
}

/**
 * Find one of `tenantId`'s products by SKU for linking. Service-role client:
 * without the tenant filter an order could bind to another merchant's product.
 */
async function findProductBySku(sku: string, tenantId: string): Promise<{
    id: string;
    name: string;
    image_url?: string;
    tag_color?: string;
} | null> {
    if (!sku) return null;

    const { data } = await supabase
        .from('products')
        .select('id, name, image_url, tag_color')
        .eq('tenant_id', tenantId)
        .eq('sku', sku)
        .single();

    return data;
}

/**
 * Map Lightfunnels order to our local format
 * Note: order_id is omitted - it will be generated by create_order_atomic RPC
 */
async function mapToLocalOrder(lfOrder: LightfunnelsOrder, tenantId: string): Promise<Omit<Order, 'id' | 'created_at' | 'updated_at'>> {
    // Get customer phone from shipping address or customer record
    const phone = lfOrder.shipping_address?.phone || lfOrder.customer.phone || '';
    const formattedPhone = formatPhoneToStandard(phone);

    // Get address details
    const city = lfOrder.shipping_address?.city || '';
    const address = [
        lfOrder.shipping_address?.line1,
        lfOrder.shipping_address?.line2,
        lfOrder.shipping_address?.area,
    ].filter(Boolean).join(', ');

    // Map line items with product linking
    const items: OrderItem[] = await Promise.all(
        lfOrder.items.map(async (item) => {
            const product = item.sku ? await findProductBySku(item.sku, tenantId) : null;

            // Use local product data when matched (our short names and images)
            if (product) {
                return {
                    name: product.name, // Use our app's short name
                    quantity: item.quantity || 1,
                    price: item.price,
                    sku: item.sku,
                    product_id: product.id,
                    image_url: product.image_url, // Use our local image
                    tag_color: product.tag_color,
                };
            }

            // Fallback to LightFunnels data if no match
            return {
                name: item.title,
                quantity: item.quantity || 1,
                price: item.price,
                sku: item.sku,
                product_id: undefined,
                image_url: undefined,
                tag_color: undefined,
            };
        })
    );

    // Determine initial status based on Lightfunnels status
    let status: Order['status'] = 'new';
    if (lfOrder.fulfillment_status === 'fulfilled') {
        status = 'delivered';
    } else if (lfOrder.financial_status === 'paid') {
        status = 'confirmed';
    }

    console.log('[mapToLocalOrder] order_id being set to:', lfOrder.name, '(lfOrder._id:', lfOrder._id, ')');

    return {
        order_id: lfOrder.name, // Use LightFunnels order number as order_id
        customer_name: lfOrder.customer.full_name || 'Unknown Customer',
        phone: formattedPhone,
        city: city,
        address_details: address || undefined,
        items,
        price: lfOrder.total,
        status,
        whatsapp_link: formattedPhone ? generateWhatsAppLink(formattedPhone, `مرحباً، بخصوص طلبك`) : undefined,
        notes: lfOrder.notes?.trim() || undefined,
        priority: 'normal',
        payment_status: lfOrder.financial_status === 'paid' ? 'paid' : 'pending',
        is_return: false,
        is_replacement: false,
        is_archived: false,
        source: 'lightfunnels',
    };
}

/**
 * Map Lightfunnels checkout to our local format
 * Note: order_id is omitted - it will be generated by create_order_atomic RPC
 */
async function mapCheckoutToLocalOrder(lfCheckout: LightfunnelsCheckout, tenantId: string): Promise<Omit<Order, 'id' | 'created_at' | 'updated_at'>> {
    const customerName = lfCheckout.customer?.full_name
        || 'Unknown Customer';

    const phone = lfCheckout.phone
        || lfCheckout.shipping_address?.phone
        || lfCheckout.billing_address?.phone
        || lfCheckout.customer?.phone
        || '';
    const formattedPhone = formatPhoneToStandard(phone);

    const city = lfCheckout.shipping_address?.city || '';
    const address = [
        lfCheckout.shipping_address?.line1,
        lfCheckout.shipping_address?.line2,
        lfCheckout.shipping_address?.area,
    ].filter(Boolean).join(', ');

    const items: OrderItem[] = await Promise.all(
        lfCheckout.variants.map(async (v) => {
            const item = v.variant;
            const product = item.sku ? await findProductBySku(item.sku, tenantId) : null;

            // Use local product data when matched
            if (product) {
                return {
                    name: product.name, // Use our app's short name
                    quantity: v.quantity,
                    price: item.price,
                    sku: item.sku,
                    product_id: product.id,
                    image_url: product.image_url, // Use our local image
                    tag_color: product.tag_color,
                };
            }

            // Fallback to LightFunnels data if no match
            return {
                name: item.title,
                quantity: v.quantity,
                price: item.price,
                sku: item.sku,
                product_id: undefined,
                image_url: item.image?.path,
                tag_color: undefined,
            };
        })
    );

    const whatsappMessage = `مرحباً ${customerName}، لاحظنا أنك لم تكمل طلبك. هل تحتاج مساعدة؟`;

    return {
        order_id: String(lfCheckout._id), // Use LightFunnels checkout ID as order_id
        customer_name: customerName,
        phone: formattedPhone,
        city: city,
        address_details: address || undefined,
        items,
        price: lfCheckout.total || items.reduce((sum, item) => sum + item.price, 0),
        status: 'pending_checkout',
        whatsapp_link: formattedPhone ? generateWhatsAppLink(formattedPhone, whatsappMessage) : undefined,
        notes: '[سلة متروكة]',
        priority: 'normal',
        payment_status: 'pending',
        is_return: false,
        is_replacement: false,
        is_archived: false,
        source: 'lightfunnels',
    };
}

/**
 * Import a single order from Lightfunnels into `tenantId`.
 *
 * Runs on the service-role client, so RLS does not apply: every lookup and
 * write below is filtered by the tenant explicitly. Before, the order was
 * created with no tenant (invisible to every merchant) and the abandoned-
 * checkout cleanup soft-deleted matching checkouts in EVERY tenant.
 */
export async function importOrder(lfOrder: LightfunnelsOrder, tenantId: string): Promise<OrderImportResult> {
    try {
        // Check for duplicate by LF reference in notes
        const exists = await checkOrderExists(lfOrder.name);
        if (exists) {
            return {
                lightfunnelsId: String(lfOrder._id),
                orderName: lfOrder.name,
                status: 'duplicate',
                message: 'Order already exists',
            };
        }

        // Map and insert order using atomic RPC
        const orderData = await mapToLocalOrder(lfOrder, tenantId);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log('[importOrder] Sending to RPC, order_id:', (orderData as any).order_id, 'keys:', Object.keys(orderData).join(', '));

        const { data, error } = await supabase
            .rpc('create_order_atomic', { _order_data: orderData, _tenant_id: tenantId });

        if (error) {
            throw error;
        }

        // The checkout this order came from goes to the trash, even when the
        // customer typed a different phone on it. Same-phone checkouts are
        // resolved by the database on insert (orders_abandoned_cart_after_insert).
        // Non-fatal: the order already exists, so a failure is only logged.
        if (lfOrder.checkout?._id) {
            const { error: cleanupError } = await supabase
                .from('orders')
                .update({ deleted_at: new Date().toISOString() })
                .eq('tenant_id', tenantId)
                .eq('order_id', String(lfOrder.checkout._id))
                .eq('status', 'pending_checkout')
                .eq('source', 'lightfunnels')
                .is('deleted_at', null);
            if (cleanupError) {
                console.error(`[importOrder] Checkout cleanup failed for ${lfOrder.name}:`, cleanupError);
            }
        }

        return {
            lightfunnelsId: String(lfOrder._id),
            orderName: lfOrder.name,
            status: 'imported',
            localOrderId: data.id,
        };
    } catch (error) {
        return {
            lightfunnelsId: String(lfOrder._id),
            orderName: lfOrder.name,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Import a single checkout from Lightfunnels into `tenantId` (service-role
 * client: every lookup is tenant-filtered explicitly).
 */
export async function importCheckout(lfCheckout: LightfunnelsCheckout, tenantId: string): Promise<OrderImportResult> {
    try {
        // Check for duplicate by order_id (table-wide UNIQUE, so not
        // tenant-filtered; only the id is read)
        const { data: existingCheckout, error: checkError } = await supabase
            .from('orders')
            .select('id')
            .eq('order_id', String(lfCheckout._id))
            .limit(1);

        if (existingCheckout && existingCheckout.length > 0 && !checkError) {
            return {
                lightfunnelsId: String(lfCheckout._id),
                orderName: `Checkout #${lfCheckout._id}`,
                status: 'duplicate',
                message: 'Checkout already exists',
            };
        }

        // Check if a real (non-checkout) order already exists for this customer
        // If the customer completed their purchase, we don't need the abandoned checkout
        const phone = lfCheckout.phone
            || lfCheckout.shipping_address?.phone
            || lfCheckout.billing_address?.phone
            || lfCheckout.customer?.phone
            || '';
        const formattedPhone = formatPhoneToStandard(phone);

        if (formattedPhone && lfCheckout.created_at) {
            const checkoutDate = new Date(lfCheckout.created_at);
            const windowStart = new Date(checkoutDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
            const windowEnd = new Date(checkoutDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

            const { data: existingRealOrders } = await supabase
                .from('orders')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('phone', formattedPhone)
                .eq('source', 'lightfunnels')
                .neq('status', 'pending_checkout')
                .gte('created_at', windowStart)
                .lte('created_at', windowEnd)
                .limit(1);

            if (existingRealOrders && existingRealOrders.length > 0) {
                return {
                    lightfunnelsId: String(lfCheckout._id),
                    orderName: `Checkout #${lfCheckout._id}`,
                    status: 'duplicate',
                    message: 'Real order already exists for this customer',
                };
            }
        }

        // Map and insert order using atomic RPC
        const orderData = await mapCheckoutToLocalOrder(lfCheckout, tenantId);

        const { data: insertData, error } = await supabase
            .rpc('create_order_atomic', { _order_data: orderData, _tenant_id: tenantId });

        if (error || !insertData) {
            throw error || new Error('Failed to insert checkout');
        }

        return {
            lightfunnelsId: String(lfCheckout._id),
            orderName: `Checkout #${lfCheckout._id}`,
            status: 'imported',
            localOrderId: insertData.id,
        };
    } catch (error) {
        return {
            lightfunnelsId: String(lfCheckout._id),
            orderName: `Checkout #${lfCheckout._id}`,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Sync all orders from Lightfunnels into `tenantId`
 */
export async function syncOrders(
    accessToken: string,
    tenantId: string,
    options: {
        dateFrom?: string;
        dateTo?: string;
        maxOrders?: number;
    } = {}
): Promise<SyncSummary> {
    const { dateFrom, dateTo, maxOrders = 500 } = options;

    const summary: SyncSummary = {
        total: 0,
        imported: 0,
        duplicates: 0,
        errors: 0,
        results: [],
    };

    // Pre-fetch existing LF order IDs to avoid per-order DB lookups
    const existingOrderNames = new Set<string>();
    try {
        let query = supabase
            .from('orders')
            .select('order_id')
            .eq('tenant_id', tenantId)
            .eq('source', 'lightfunnels');

        if (dateFrom) {
            query = query.gte('created_at', `${dateFrom}T00:00:00`);
        }
        if (dateTo) {
            query = query.lte('created_at', `${dateTo}T23:59:59.999`);
        }

        const { data: existingOrders } = await query;
        if (existingOrders) {
            for (const o of existingOrders) {
                if (o.order_id) {
                    existingOrderNames.add(o.order_id);
                }
            }
        }
    } catch {
        // Non-fatal: fall back to per-order checks via importOrder()
    }

    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore && summary.total < maxOrders) {
        const batchSize = Math.min(50, maxOrders - summary.total);

        const { orders, hasNextPage, endCursor } = await fetchOrders(accessToken, {
            limit: batchSize,
            cursor,
            dateFrom,
            dateTo,
        });

        for (const order of orders) {
            summary.total++;

            // Fast path: skip known duplicates without hitting the DB
            if (existingOrderNames.has(order.name)) {
                summary.duplicates++;
                summary.results.push({
                    lightfunnelsId: String(order._id),
                    orderName: order.name,
                    status: 'duplicate',
                    message: 'Order already exists',
                });
                continue;
            }

            const result = await importOrder(order, tenantId);
            summary.results.push(result);

            switch (result.status) {
                case 'imported':
                    summary.imported++;
                    existingOrderNames.add(order.name);
                    break;
                case 'duplicate':
                    summary.duplicates++;
                    break;
                case 'error':
                    summary.errors++;
                    break;
            }
        }

        cursor = endCursor;
        hasMore = hasNextPage && orders.length > 0;
    }

    return summary;
}

/**
 * Sync all abandoned checkouts from Lightfunnels into `tenantId`
 */
export async function syncCheckouts(
    accessToken: string,
    tenantId: string,
    options: {
        dateFrom?: string;
        dateTo?: string;
        maxCheckouts?: number;
    } = {}
): Promise<SyncSummary> {
    const { dateFrom, dateTo, maxCheckouts = 500 } = options;

    const summary: SyncSummary = {
        total: 0,
        imported: 0,
        duplicates: 0,
        errors: 0,
        results: [],
    };

    // Pre-fetch existing checkout references from notes and real order phones to avoid per-checkout DB lookups
    const existingCheckoutIds = new Set<string>();
    const realOrderPhones = new Set<string>();
    try {
        // Fetch existing checkout order_ids
        const { data: existingCheckouts } = await supabase
            .from('orders')
            .select('order_id')
            .eq('tenant_id', tenantId)
            .eq('source', 'lightfunnels')
            .eq('status', 'pending_checkout');

        if (existingCheckouts) {
            for (const c of existingCheckouts) {
                if (c.order_id) {
                    existingCheckoutIds.add(c.order_id);
                }
            }
        }

        // Fetch phones from real orders in the date range (for abandoned checkout detection)
        let realQuery = supabase
            .from('orders')
            .select('phone')
            .eq('tenant_id', tenantId)
            .eq('source', 'lightfunnels')
            .neq('status', 'pending_checkout')
            .not('phone', 'is', null);

        if (dateFrom) {
            realQuery = realQuery.gte('created_at', new Date(new Date(dateFrom + 'T00:00:00').getTime() - 24 * 60 * 60 * 1000).toISOString());
        }
        if (dateTo) {
            realQuery = realQuery.lte('created_at', new Date(new Date(dateTo + 'T23:59:59.999').getTime() + 24 * 60 * 60 * 1000).toISOString());
        }

        const { data: realOrders } = await realQuery;
        if (realOrders) {
            for (const o of realOrders) {
                if (o.phone) realOrderPhones.add(o.phone);
            }
        }
    } catch {
        // Non-fatal: fall back to per-checkout checks via importCheckout()
    }

    let cursor: string | undefined;
    let hasMore = true;

    // Parse date boundaries once for client-side filtering
    const fromDate = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
    const toDate = dateTo ? new Date(dateTo + 'T23:59:59.999') : null;
    let emptyFilteredBatches = 0; // Track consecutive batches with no matches
    let pageNumber = 0;

    console.log('[syncCheckouts] dateFrom:', dateFrom, 'dateTo:', dateTo, 'fromDate:', fromDate, 'toDate:', toDate);

    while (hasMore && summary.total < maxCheckouts) {
        const batchSize = Math.min(50, maxCheckouts - summary.total);
        pageNumber++;

        const { checkouts, hasNextPage, endCursor } = await fetchCheckouts(accessToken, {
            limit: batchSize,
            cursor,
            dateFrom,
            dateTo,
        });

        console.log(`[syncCheckouts] Page ${pageNumber}: ${checkouts.length} checkouts from API`);

        if (checkouts.length === 0) break;

        // Log first and last dates in batch for debugging
        if (checkouts.length > 0) {
            console.log(`[syncCheckouts] Page ${pageNumber} date range: ${checkouts[0].created_at} to ${checkouts[checkouts.length - 1].created_at}`);
        }

        // Client-side date filtering (Lightfunnels checkouts API ignores created_at query filter)
        const dateFilteredCheckouts = (fromDate || toDate) ? checkouts.filter(checkout => {
            if (!checkout.created_at) return false; // Skip checkouts with no date when filtering
            const createdAt = new Date(checkout.created_at);
            if (fromDate && createdAt < fromDate) return false;
            if (toDate && createdAt > toDate) return false;
            return true;
        }) : checkouts;

        console.log(`[syncCheckouts] Page ${pageNumber}: ${dateFilteredCheckouts.length} after date filter (of ${checkouts.length})`);

        // Early termination: if we have date filters and this batch had no matches
        if ((fromDate || toDate) && dateFilteredCheckouts.length === 0) {
            emptyFilteredBatches++;
            // After 2 consecutive empty batches, stop — we've moved out of the date range
            if (emptyFilteredBatches >= 2) break;
        } else {
            emptyFilteredBatches = 0;
        }

        // Also break early if all checkouts in batch are BEFORE our date range (API returns newest first)
        if (fromDate && checkouts.length > 0) {
            const allBeforeRange = checkouts.every(c => {
                if (!c.created_at) return false;
                return new Date(c.created_at) < fromDate;
            });
            if (allBeforeRange) break;
        }

        // Import each checkout
        for (const checkout of dateFilteredCheckouts) {
            summary.total++;

            // Fast path: skip if checkout already exists (by LF ID)
            if (existingCheckoutIds.has(String(checkout._id))) {
                summary.duplicates++;
                summary.results.push({
                    lightfunnelsId: String(checkout._id),
                    orderName: `Checkout #${checkout._id}`,
                    status: 'duplicate',
                    message: 'Checkout already exists',
                });
                continue;
            }

            // Fast path: skip if a real order exists for this phone
            const chkPhone = checkout.phone
                || checkout.shipping_address?.phone
                || checkout.billing_address?.phone
                || checkout.customer?.phone
                || '';
            const chkFormattedPhone = formatPhoneToStandard(chkPhone);

            if (chkFormattedPhone && realOrderPhones.has(chkFormattedPhone)) {
                summary.duplicates++;
                summary.results.push({
                    lightfunnelsId: String(checkout._id),
                    orderName: `Checkout #${checkout._id}`,
                    status: 'duplicate',
                    message: 'Real order already exists for this customer',
                });
                continue;
            }

            const result = await importCheckout(checkout, tenantId);
            summary.results.push(result);

            switch (result.status) {
                case 'imported':
                    summary.imported++;
                    existingCheckoutIds.add(String(checkout._id));
                    break;
                case 'duplicate':
                    summary.duplicates++;
                    break;
                case 'error':
                    summary.errors++;
                    break;
            }
        }

        cursor = endCursor;
        hasMore = hasNextPage && checkouts.length > 0;
    }

    return summary;
}

/**
 * Get the saved access token from database settings
 * @param supabaseClient Optional custom supabase client (useful on server with service role)
 */
export async function getSavedAccessToken(supabaseClient?: unknown): Promise<string | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (supabaseClient as { from: (table: string) => any } | undefined) || supabase;

    try {
        const { data, error } = await client
            .from('settings')
            .select('value')
            .eq('key', 'lightfunnels_access_token')
            .single();

        if (error) {
            console.error('Error getting access token from DB:', error.message);
            return null;
        }

        return data?.value || null;
    } catch (err) {
        console.error('Unexpected error getting access token:', err);
        return null;
    }
}

/**
 * Save access token to database settings
 */
export async function saveAccessToken(token: string): Promise<boolean> {
    const { error } = await supabase
        .from('settings')
        .upsert({
            key: 'lightfunnels_access_token',
            value: token,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'key',
        });

    return !error;
}

/**
 * Remove saved access token
 */
export async function removeAccessToken(): Promise<boolean> {
    const { error } = await supabase
        .from('settings')
        .delete()
        .eq('key', 'lightfunnels_access_token');

    return !error;
}
