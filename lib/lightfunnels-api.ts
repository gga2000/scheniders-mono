/**
 * Lightfunnels GraphQL API Client
 * 
 * Connects to Lightfunnels API to fetch orders and products.
 * API Docs: https://developers.lightfunnels.com
 */

import { supabase } from './supabase';
import { formatPhoneToStandard } from './order-utils';
import { generateWhatsAppLink } from './utils';
import type { Order, OrderItem } from './supabase';

// API Configuration
const LIGHTFUNNELS_API_URL = 'https://services.lightfunnels.com/api/v2';

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
        address1?: string;
        address2?: string;
        city?: string;
        province?: string;
        country?: string;
        phone?: string;
    };
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

/**
 * Sync summary
 */
export interface SyncSummary {
    total: number;
    imported: number;
    duplicates: number;
    errors: number;
    results: OrderImportResult[];
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
                    address1
                    address2
                    city
                    province
                    country
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
            step_id
            phone
            email
            first_name
            last_name
            created_at
            updated_at
            total
            subtotal
            custom
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
                first_name
                last_name
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
                first_name
                last_name
                phone
                city
                country
            }
            customer {
                id
                full_name
                phone
                location
            }
        }
    }
}
`;

/**
 * Query to fetch multiple checkouts (abandoned orders)
 */
const CHECKOUTS_QUERY = `
query GetCheckouts($first: Int!, $after: String, $query: String) {
    checkouts(first: $first, after: $after, query: $query, sort: { column: "id", order: DESC }) {
        edges {
            node {
                id
                _id
                step_id
                phone
                email
                first_name
                last_name
                created_at
                updated_at
                total
                subtotal
                custom
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
                    first_name
                    last_name
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
                    first_name
                    last_name
                    phone
                    city
                    country
                }
                customer {
                    id
                    full_name
                    phone
                    location
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
    phone?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    created_at: string;
    total: number;
    subtotal?: number;
    custom?: Record<string, unknown>;
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
        first_name?: string;
        last_name?: string;
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
        first_name?: string;
        last_name?: string;
        phone?: string;
        city?: string;
        country?: string;
    };
    customer?: {
        id: string;
        full_name?: string;
        phone?: string;
        location?: string;
    };
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
        if (dateFrom) filters.push(`created_at:>=${dateFrom}`);
        if (dateTo) filters.push(`created_at:<=${dateTo}`);
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
export async function fetchCheckouts(
    accessToken: string,
    options: {
        limit?: number;
        cursor?: string;
        dateFrom?: string;
        dateTo?: string;
    } = {}
): Promise<{
    checkouts: LightfunnelsCheckout[];
    hasNextPage: boolean;
    endCursor?: string;
}> {
    const { limit = 50, cursor, dateFrom, dateTo } = options;

    // Use the orders query with status:pending_checkout filter for abandoned checkouts
    const filters: string[] = ['status:pending_checkout'];
    if (dateFrom) filters.push(`created_at:>=${dateFrom}`);
    if (dateTo) filters.push(`created_at:<=${dateTo}`);
    const query = filters.join(' AND ');

    const data = await executeQuery<{
        orders: {
            edges: Array<{ node: LightfunnelsOrder }>;
            pageInfo: { hasNextPage: boolean; endCursor?: string };
        };
    }>(
        ORDERS_QUERY,
        { first: limit, after: cursor, query: query },
        accessToken
    );

    // Map Order type to Checkout type format
    const checkouts: LightfunnelsCheckout[] = data.orders.edges.map(edge => {
        const order = edge.node;
        return {
            id: order.id,
            _id: order._id,
            phone: order.customer.phone || order.shipping_address?.phone,
            email: order.customer.email,
            first_name: order.customer.full_name?.split(' ')[0] || '',
            last_name: order.customer.full_name?.split(' ').slice(1).join(' ') || '',
            created_at: order.created_at,
            total: order.total,
            subtotal: order.subtotal,
            variants: (order.checkout?.variants || []).map(cv => ({
                quantity: cv.quantity,
                variant: {
                    id: cv.variant.id,
                    _id: cv.variant._id,
                    title: cv.variant.title,
                    price: cv.variant.price,
                    sku: cv.variant.sku,
                    product_id: cv.variant.product_id
                }
            })),
            shipping_address: order.shipping_address ? {
                first_name: order.customer.full_name?.split(' ')[0] || '',
                last_name: order.customer.full_name?.split(' ').slice(1).join(' ') || '',
                phone: order.shipping_address.phone,
                line1: order.shipping_address.address1 || '',
                line2: order.shipping_address.address2 || '',
                city: order.shipping_address.city || '',
                country: order.shipping_address.country || '',
            } : undefined,
            customer: {
                id: order.customer.id,
                full_name: order.customer.full_name,
                phone: order.customer.phone,
            }
        };
    });

    return {
        checkouts,
        hasNextPage: data.orders.pageInfo.hasNextPage,
        endCursor: data.orders.pageInfo.endCursor,
    };
}

/**
 * Check if order already exists in our database
 */
async function checkOrderExists(lightfunnelsId: string): Promise<boolean> {
    const { data } = await supabase
        .from('orders')
        .select('id')
        .eq('order_id', `LF-${lightfunnelsId}`)
        .single();

    return !!data;
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
 * Map Lightfunnels order to our local format
 */
async function mapToLocalOrder(lfOrder: LightfunnelsOrder): Promise<Omit<Order, 'id' | 'created_at' | 'updated_at'>> {
    // Get customer phone from shipping address or customer record
    const phone = lfOrder.shipping_address?.phone || lfOrder.customer.phone || '';
    const formattedPhone = formatPhoneToStandard(phone);

    // Get address details
    const city = lfOrder.shipping_address?.city || '';
    const address = [
        lfOrder.shipping_address?.address1,
        lfOrder.shipping_address?.address2,
    ].filter(Boolean).join(', ');

    // Map line items with product linking
    const items: OrderItem[] = await Promise.all(
        lfOrder.items.map(async (item) => {
            const product = item.sku ? await findProductBySku(item.sku) : null;

            return {
                name: item.title,
                quantity: item.quantity || 1,
                price: item.price,
                sku: item.sku,
                product_id: product?.id,
                image_url: product?.image_url,
                tag_color: product?.tag_color,
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

    return {
        order_id: `LF-${lfOrder._id}`,
        customer_name: lfOrder.customer.full_name || 'Unknown Customer',
        phone: formattedPhone,
        city: city,
        address_details: address || undefined,
        items,
        price: lfOrder.total,
        status,
        whatsapp_link: formattedPhone ? generateWhatsAppLink(formattedPhone, `مرحباً، بخصوص طلبك ${lfOrder.name}`) : undefined,
        notes: lfOrder.notes || undefined,
        priority: 'normal',
        payment_status: lfOrder.financial_status === 'paid' ? 'paid' : 'pending',
        is_return: false,
        is_archived: false,
        source: 'lightfunnels',
    };
}

/**
 * Map Lightfunnels checkout to our local format
 */
async function mapCheckoutToLocalOrder(lfCheckout: LightfunnelsCheckout): Promise<Omit<Order, 'id' | 'created_at' | 'updated_at'>> {
    const customerName = [lfCheckout.first_name, lfCheckout.last_name].filter(Boolean).join(' ').trim()
        || lfCheckout.customer?.full_name
        || lfCheckout.shipping_address?.first_name
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
            const product = item.sku ? await findProductBySku(item.sku) : null;
            return {
                name: item.title,
                quantity: v.quantity,
                price: item.price,
                sku: item.sku,
                product_id: product?.id,
                image_url: product?.image_url || item.image?.path,
                tag_color: product?.tag_color,
            };
        })
    );

    const whatsappMessage = `مرحباً ${customerName}، لاحظنا أنك لم تكمل طلبك. هل تحتاج مساعدة؟`;

    return {
        order_id: `CHK-${lfCheckout._id}`,
        customer_name: customerName,
        phone: formattedPhone,
        city: city,
        address_details: address || undefined,
        items,
        price: lfCheckout.total || items.reduce((sum, item) => sum + item.price, 0),
        status: 'pending_checkout',
        whatsapp_link: formattedPhone ? generateWhatsAppLink(formattedPhone, whatsappMessage) : undefined,
        notes: `[سلة متروكة]`,
        priority: 'normal',
        payment_status: 'pending',
        is_return: false,
        is_archived: false,
        source: 'lightfunnels',
    };
}

/**
 * Import a single order from Lightfunnels
 */
export async function importOrder(lfOrder: LightfunnelsOrder): Promise<OrderImportResult> {
    try {
        // Check for duplicate
        const exists = await checkOrderExists(String(lfOrder._id));
        if (exists) {
            return {
                lightfunnelsId: String(lfOrder._id),
                orderName: lfOrder.name,
                status: 'duplicate',
                message: 'Order already exists',
            };
        }

        // Map and insert order
        const orderData = await mapToLocalOrder(lfOrder);

        const { data, error } = await supabase
            .from('orders')
            .insert([orderData])
            .select('id, order_id')
            .single();

        if (error) {
            throw error;
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
 * Import a single checkout from Lightfunnels
 */
export async function importCheckout(lfCheckout: LightfunnelsCheckout): Promise<OrderImportResult> {
    try {
        // Check for duplicate
        const exists = await checkOrderExists(`CHK-${lfCheckout._id}`);
        // Note: checkOrderExists adds 'LF-' prefix, need to handle CHK separately or directly
        const { data } = await supabase
            .from('orders')
            .select('id')
            .eq('order_id', `CHK-${lfCheckout._id}`)
            .single();

        if (data) {
            return {
                lightfunnelsId: String(lfCheckout._id),
                orderName: `Checkout #${lfCheckout._id}`,
                status: 'duplicate',
                message: 'Checkout already exists',
            };
        }

        // Map and insert order
        const orderData = await mapCheckoutToLocalOrder(lfCheckout);

        const { data: insertData, error } = await supabase
            .from('orders')
            .insert([orderData])
            .select('id, order_id')
            .single();

        if (error) {
            throw error;
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
 * Sync all orders from Lightfunnels
 */
export async function syncOrders(
    accessToken: string,
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

        // Import each order
        for (const order of orders) {
            const result = await importOrder(order);
            summary.results.push(result);
            summary.total++;

            switch (result.status) {
                case 'imported':
                    summary.imported++;
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
 * Sync all abandoned checkouts from Lightfunnels
 */
export async function syncCheckouts(
    accessToken: string,
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

    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore && summary.total < maxCheckouts) {
        const batchSize = Math.min(50, maxCheckouts - summary.total);

        const { checkouts, hasNextPage, endCursor } = await fetchCheckouts(accessToken, {
            limit: batchSize,
            cursor,
            dateFrom,
            dateTo,
        });

        // Import each checkout
        for (const checkout of checkouts) {
            const result = await importCheckout(checkout);
            summary.results.push(result);
            summary.total++;

            switch (result.status) {
                case 'imported':
                    summary.imported++;
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
 */
export async function getSavedAccessToken(): Promise<string | null> {
    const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'lightfunnels_access_token')
        .single();

    return data?.value || null;
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
