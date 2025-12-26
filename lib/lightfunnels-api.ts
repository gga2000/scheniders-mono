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
    note?: string;
    customer: {
        id: string;
        full_name: string;
        email?: string;
        phone?: string;
        default_address?: {
            address1?: string;
            address2?: string;
            city?: string;
            province?: string;
            country?: string;
            zip?: string;
        };
    };
    line_items: Array<{
        id: string;
        name: string;
        quantity: number;
        price: number;
        sku?: string;
        product_id?: string;
    }>;
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
query GetOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sort: { column: "id", order: DESC }) {
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
                note
                customer {
                    id
                    full_name
                    email
                    phone
                    default_address {
                        address1
                        address2
                        city
                        province
                        country
                        zip
                    }
                }
                line_items {
                    id
                    name
                    quantity
                    price
                    sku
                    product_id
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
 * Query to test connection and get store info
 */
const STORE_INFO_QUERY = `
query GetStoreInfo {
    store {
        id
        name
        email
        currency
    }
}
`;

/**
 * Test connection to Lightfunnels API
 */
export async function testConnection(accessToken: string): Promise<{
    success: boolean;
    storeName?: string;
    error?: string;
}> {
    try {
        const data = await executeQuery<{ store: { id: string; name: string; email: string } }>(
            STORE_INFO_QUERY,
            {},
            accessToken
        );

        return {
            success: true,
            storeName: data.store.name,
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
        { first: limit, after: cursor, query: query || undefined },
        accessToken
    );

    return {
        orders: data.orders.edges.map(edge => edge.node),
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
    const city = lfOrder.shipping_address?.city || lfOrder.customer.default_address?.city || '';
    const address = [
        lfOrder.shipping_address?.address1,
        lfOrder.shipping_address?.address2,
    ].filter(Boolean).join(', ');

    // Map line items with product linking
    const items: OrderItem[] = await Promise.all(
        lfOrder.line_items.map(async (item) => {
            const product = item.sku ? await findProductBySku(item.sku) : null;

            return {
                name: item.name,
                quantity: item.quantity,
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
        notes: lfOrder.note || undefined,
        priority: 'normal',
        payment_status: lfOrder.financial_status === 'paid' ? 'paid' : 'pending',
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
