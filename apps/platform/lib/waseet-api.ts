/**
 * Al-Waseet Delivery API Client
 *
 * Server-side module for all Al-Waseet API interactions.
 * Handles authentication, rate limiting, retries, and audit logging.
 *
 * API Docs: https://al-waseet.com/apis-main/index#Integration
 * Base URL: https://api.alwaseet-iq.net/v1/merchant/
 * Content-Type: multipart/form-data (NOT JSON)
 * Auth: Token passed as ?token= query parameter
 * Rate Limit: 30 requests per 30 seconds per user
 */

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { formatPhoneToStandard } from "@/lib/order-utils";
import { extractGovernorate } from "@/lib/address-validator";
import type { Order } from "@/types/order";
import { computeCodAmount } from "@/lib/order-money";
import type {
    WaseetApiResult,
    WaseetCity,
    WaseetRegion,
    WaseetPackageSize,
    WaseetStatus,
    WaseetCreateOrderBody,
    WaseetCreateOrderResponse,
    WaseetMerchantOrder,
    WaseetInvoice,
    WaseetInvoiceOrdersResponse,
    WaseetCityMapping,
} from "@/types/waseet";

// =============================================
// CONSTANTS
// =============================================

const BASE_URL = "https://api.alwaseet-iq.net/v1/merchant";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX_REQUESTS = 28; // Leave 2-request buffer from the 30 limit

// =============================================
// RATE LIMITER
// =============================================

class RateLimiter {
    private timestamps: number[] = [];

    canProceed(): boolean {
        const now = Date.now();
        this.timestamps = this.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
        return this.timestamps.length < RATE_LIMIT_MAX_REQUESTS;
    }

    record(): void {
        this.timestamps.push(Date.now());
    }

    waitTime(): number {
        if (this.canProceed()) return 0;
        const oldest = this.timestamps[0];
        return RATE_LIMIT_WINDOW_MS - (Date.now() - oldest) + 100; // +100ms safety buffer
    }
}

const rateLimiter = new RateLimiter();

// =============================================
// TOKEN MANAGEMENT
// =============================================

/**
 * Get the cached Al-Waseet token from app_settings, or login to get a new one.
 */
async function getToken(): Promise<string> {
    const supabaseAdmin = createSupabaseServiceClient();

    // Try cached token first
    const { data } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "waseet_token")
        .single();

    if (data?.value?.token) {
        return data.value.token;
    }

    // No cached token, perform login
    return await login();
}

/**
 * Login to Al-Waseet API and cache the token.
 * Token persists until password change per API docs.
 */
async function login(): Promise<string> {
    const username = process.env.WASEET_USERNAME;
    const password = process.env.WASEET_PASSWORD;

    if (!username || !password) {
        throw new Error("WASEET_USERNAME and WASEET_PASSWORD environment variables must be configured");
    }

    const formData = new FormData();
    formData.append("username", username);
    formData.append("password", password);

    const response = await fetch(`${BASE_URL}/login`, {
        method: "POST",
        body: formData,
    });

    const result = await response.json();

    if (!response.ok || !result?.status) {
        throw new Error(`Al-Waseet login failed: ${result?.msg || `HTTP ${response.status}`}`);
    }

    const token = result?.data?.token;
    if (!token) {
        throw new Error("Al-Waseet login response missing token in data.token");
    }

    // Cache token in app_settings
    const supabaseAdmin = createSupabaseServiceClient();
    await supabaseAdmin.from("app_settings").upsert({
        key: "waseet_token",
        value: { token, obtainedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
    });

    console.log("[Waseet] Login successful, token cached");
    return token;
}

/**
 * Clear cached token (call on persistent auth failures).
 */
async function clearToken(): Promise<void> {
    const supabaseAdmin = createSupabaseServiceClient();
    await supabaseAdmin.from("app_settings").delete().eq("key", "waseet_token");
}

// =============================================
// CORE REQUEST FUNCTION
// =============================================

interface WaseetRequestOptions {
    requiresAuth?: boolean;
    orderId?: string;        // Link to our order UUID for audit
    triggeredBy?: string;    // 'manual' | 'cron' | 'batch'
}

/**
 * Make a request to the Al-Waseet API with retry, rate limiting, and audit logging.
 *
 * CRITICAL NOTES (from API docs):
 * - Content-Type is multipart/form-data (uses FormData, NOT JSON)
 * - Token goes in query string as ?token=XXX (NOT Authorization header)
 * - Do NOT manually set Content-Type header — FormData sets it with boundary
 */
async function waseetRequest<T>(
    endpoint: string,
    method: "GET" | "POST",
    queryParams?: Record<string, string | number>,
    bodyFields?: Record<string, string | number>,
    options?: WaseetRequestOptions
): Promise<WaseetApiResult<T>> {
    const { requiresAuth = true, orderId, triggeredBy = "manual" } = options || {};
    const startTime = Date.now();
    let lastError: string | undefined;
    let didReAuth = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Rate limit check — wait if necessary
            if (!rateLimiter.canProceed()) {
                const waitMs = rateLimiter.waitTime();
                console.warn(`[Waseet] Rate limit reached, waiting ${waitMs}ms`);
                await new Promise(r => setTimeout(r, waitMs));
            }

            // Build URL with query parameters
            const urlParams = new URLSearchParams();

            if (requiresAuth) {
                const token = await getToken();
                urlParams.set("token", token);
            }

            if (queryParams) {
                for (const [k, v] of Object.entries(queryParams)) {
                    urlParams.set(k, String(v));
                }
            }

            const queryString = urlParams.toString();
            const url = `${BASE_URL}/${endpoint}${queryString ? `?${queryString}` : ""}`;

            // Build fetch options
            const fetchOptions: RequestInit = { method };

            if (method === "POST" && bodyFields) {
                // CRITICAL: Use FormData, NOT JSON. Al-Waseet requires multipart/form-data.
                // Do NOT set Content-Type header — FormData sets it automatically with boundary.
                const formData = new FormData();
                for (const [k, v] of Object.entries(bodyFields)) {
                    formData.append(k, String(v));
                }
                fetchOptions.body = formData;
            }

            rateLimiter.record();
            const response = await fetch(url, fetchOptions);

            // Handle 401 — re-authenticate ONCE then retry
            if (response.status === 401 && requiresAuth && !didReAuth) {
                console.warn("[Waseet] 401 received, clearing token and re-authenticating...");
                await clearToken();
                await login();
                didReAuth = true;
                continue; // Retry with new token
            }

            // Handle rate limit from server (429)
            if (response.status === 429 && attempt < MAX_RETRIES) {
                const retryAfter = RETRY_DELAY_MS * (attempt + 1) * 2;
                console.warn(`[Waseet] Rate limited (429), waiting ${retryAfter}ms`);
                await new Promise(r => setTimeout(r, retryAfter));
                continue;
            }

            const responseData = await response.json();
            const duration = Date.now() - startTime;

            // Audit log (fire-and-forget, never blocks)
            logWaseetApiCall(
                endpoint, method, bodyFields || queryParams || null,
                responseData, response.status, responseData?.status === true,
                null, orderId, duration, triggeredBy
            );

            // Al-Waseet returns { status: true/false, errNum, msg, data }
            if (!response.ok || responseData?.status === false) {
                return {
                    success: false,
                    error: responseData?.msg || `HTTP ${response.status}`,
                    httpStatus: response.status,
                };
            }

            return {
                success: true,
                data: responseData?.data as T,
            };

        } catch (error) {
            lastError = error instanceof Error ? error.message : "Network error";
            console.error(`[Waseet] Error on attempt ${attempt + 1}/${MAX_RETRIES + 1}:`, lastError);

            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
            }
        }
    }

    const duration = Date.now() - startTime;
    logWaseetApiCall(endpoint, method, bodyFields || queryParams || null, null, null, false, lastError || "Max retries exceeded", orderId, duration, triggeredBy);

    return { success: false, error: lastError || "Max retries exceeded" };
}

// =============================================
// AUDIT LOGGING
// =============================================

/**
 * Log Al-Waseet API call to waseet_api_logs table.
 * Fire-and-forget — never throws, never blocks.
 */
function logWaseetApiCall(
    endpoint: string,
    method: string,
    requestData: Record<string, unknown> | null,
    responseData: unknown,
    httpStatus: number | null,
    success: boolean,
    errorMessage: string | null,
    orderId: string | undefined,
    durationMs: number,
    triggeredBy: string
): void {
    // Async, non-blocking
    (async () => {
        try {
            const supabaseAdmin = createSupabaseServiceClient();
            await supabaseAdmin.from("waseet_api_logs").insert({
                endpoint,
                method,
                request_data: requestData,
                response_data: responseData as Record<string, unknown> | null,
                http_status: httpStatus,
                success,
                error_message: errorMessage,
                order_id: orderId || null,
                duration_ms: durationMs,
                triggered_by: triggeredBy,
            });
        } catch (err) {
            console.error("[Waseet] Failed to write audit log:", err);
        }
    })();
}

// =============================================
// ENDPOINT WRAPPERS
// =============================================

// --- Public endpoints (no auth required) ---

export async function fetchCities(): Promise<WaseetApiResult<WaseetCity[]>> {
    return waseetRequest("citys", "GET", undefined, undefined, { requiresAuth: false });
}

export async function fetchRegions(cityId: number): Promise<WaseetApiResult<WaseetRegion[]>> {
    return waseetRequest("regions", "GET", { city_id: cityId }, undefined, { requiresAuth: false });
}

export async function fetchPackageSizes(): Promise<WaseetApiResult<WaseetPackageSize[]>> {
    return waseetRequest("package-sizes", "GET", undefined, undefined, { requiresAuth: false });
}

// --- Auth required endpoints ---

export async function createWaseetOrder(
    body: WaseetCreateOrderBody,
    orderId?: string
): Promise<WaseetApiResult<WaseetCreateOrderResponse>> {
    // Convert the typed body to a flat Record for FormData
    const fields: Record<string, string | number> = {
        client_name: body.client_name,
        client_mobile: body.client_mobile,
        city_id: body.city_id,
        region_id: body.region_id,
        location: body.location,
        type_name: body.type_name,
        items_number: body.items_number,
        price: body.price,
        package_size: body.package_size,
        replacement: body.replacement,
    };

    if (body.client_mobile2) {
        fields.client_mobile2 = body.client_mobile2;
    }
    if (body.merchant_notes) {
        fields.merchant_notes = body.merchant_notes;
    }

    return waseetRequest("create-order", "POST", undefined, fields, { orderId });
}

export async function editWaseetOrder(
    qrId: string,
    body: Partial<WaseetCreateOrderBody>,
    orderId?: string
): Promise<WaseetApiResult<unknown>> {
    const fields: Record<string, string | number> = { qr_id: qrId };

    for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null) {
            fields[k] = v as string | number;
        }
    }

    return waseetRequest("edit-order", "POST", undefined, fields, { orderId });
}

export async function fetchMerchantOrders(triggeredBy = "manual"): Promise<WaseetApiResult<WaseetMerchantOrder[]>> {
    return waseetRequest("merchant-orders", "GET", undefined, undefined, { triggeredBy });
}

export async function fetchStatuses(): Promise<WaseetApiResult<WaseetStatus[]>> {
    return waseetRequest("statuses", "GET");
}

/**
 * Fetch up to 25 orders by their Al-Waseet IDs.
 * CRITICAL: Max 25 IDs per request per API docs.
 */
export async function fetchOrdersByIdsBulk(ids: string[]): Promise<WaseetApiResult<WaseetMerchantOrder[]>> {
    if (ids.length === 0) {
        return { success: true, data: [] };
    }
    if (ids.length > 25) {
        return { success: false, error: "Maximum 25 order IDs per request" };
    }
    return waseetRequest("get-orders-by-ids-bulk", "POST", undefined, { ids: ids.join(",") });
}

export async function fetchMerchantInvoices(): Promise<WaseetApiResult<WaseetInvoice[]>> {
    return waseetRequest("get_merchant_invoices", "GET");
}

export async function fetchMerchantInvoiceOrders(invoiceId: string): Promise<WaseetApiResult<WaseetInvoiceOrdersResponse>> {
    return waseetRequest("get_merchant_invoice_orders", "GET", { invoice_id: invoiceId });
}

export async function receiveMerchantInvoice(invoiceId: string): Promise<WaseetApiResult<unknown>> {
    return waseetRequest("receive_merchant_invoice", "GET", { invoice_id: invoiceId });
}

// =============================================
// ORDER DATA MAPPER
// =============================================

export interface OrderMappingResult {
    success: boolean;
    data?: WaseetCreateOrderBody;
    errors?: string[];
}

/**
 * Map our Order to Al-Waseet's create-order body.
 *
 * CRITICAL FIELD MAPPINGS (verified against API docs):
 * - phone: 07XXXXXXXXX → "+9647XXXXXXXXX" (uses formatPhoneToStandard)
 * - price: order.price + order.delivery_fee (total WITH delivery)
 * - replacement: 1 if is_replacement or is_return, else 0
 * - city_id/region_id: from waseet_city_mappings table
 * - package_size: default from settings
 */
export function mapOrderToWaseet(
    order: Order,
    cityMappings: WaseetCityMapping[],
    defaultPackageSizeId: number
): OrderMappingResult {
    const errors: string[] = [];

    // 1. Phone: 07XXXXXXXXX → +9647XXXXXXXXX
    const clientMobile = formatPhoneToStandard(order.phone);
    if (!clientMobile.startsWith("+964") || clientMobile.length !== 14) {
        errors.push(`Invalid primary phone: "${order.phone}" → "${clientMobile}" (expected +964XXXXXXXXXX, 14 chars)`);
    }

    let clientMobile2: string | undefined;
    if (order.secondary_phone) {
        const converted = formatPhoneToStandard(order.secondary_phone);
        if (converted.startsWith("+964") && converted.length === 14) {
            clientMobile2 = converted;
        }
        // Skip invalid secondary phones silently — not a blocking error
    }

    // 2. City/Region mapping via governorate code
    const govCode = order.validated_governorate_code || order.governorate_code;
    let cityId: number | undefined;
    let regionId: number | undefined;

    if (govCode) {
        const mapping = cityMappings.find(m => m.governorate_code === govCode.toUpperCase());
        if (mapping) {
            cityId = mapping.waseet_city_id;
            regionId = mapping.waseet_default_region_id ?? undefined;
        }
    }

    // Fallback: extract governorate from city text
    if (!cityId && order.city) {
        const { governorate } = extractGovernorate(order.city, undefined, order.address_details);
        if (governorate) {
            const mapping = cityMappings.find(m => m.governorate_code === governorate.code);
            if (mapping) {
                cityId = mapping.waseet_city_id;
                regionId = mapping.waseet_default_region_id ?? undefined;
            }
        }
    }

    if (!cityId) {
        errors.push(`Cannot map city: governorate_code="${govCode || "missing"}", city="${order.city || "missing"}"`);
    }
    if (!regionId) {
        errors.push(`No default region mapped for: governorate_code="${govCode || "missing"}"`);
    }

    // 3. Location description
    const location = [order.city, order.address_details].filter(Boolean).join(" - ") || "غير محدد";

    // 4. Product type (join item names)
    const typeName = order.items?.map(item => item.name).filter(Boolean).join(" + ") || "عطور";

    // 5. Items count (sum of quantities)
    const itemsNumber = order.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 1;

    // 6. Price — Al-Waseet wants the amount the courier COLLECTS. `order.price`
    // is already net of the discount (see lib/order-money), so the COD amount is
    // price + delivery_fee; subtracting discount_amount here deducted it twice.
    const price = computeCodAmount(order);
    // A prepaid order legitimately collects 0 — the customer has already paid,
    // so rejecting 0 here would make prepaid orders unshippable. Any OTHER
    // order with nothing to collect is a data problem worth surfacing.
    const isPrepaidOrder = order.payment_status === "prepaid" || order.payment_status === "paid";
    if (price < 0 || (price === 0 && !isPrepaidOrder)) {
        errors.push(`Invalid price: ${price} (order.price=${order.price}, delivery_fee=${order.delivery_fee}, payment_status=${order.payment_status})`);
    }

    // 7. Replacement flag
    const replacement: 0 | 1 = (order.is_replacement || order.is_return) ? 1 : 0;

    // 8. Customer name
    if (!order.customer_name || order.customer_name.trim().length === 0) {
        errors.push("Missing customer name");
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    const body: WaseetCreateOrderBody = {
        client_name: order.customer_name,
        client_mobile: clientMobile,
        city_id: cityId!,
        region_id: regionId!,
        location,
        type_name: typeName,
        items_number: itemsNumber,
        price,
        package_size: defaultPackageSizeId,
        replacement,
    };

    if (clientMobile2) {
        body.client_mobile2 = clientMobile2;
    }

    if (order.notes) {
        body.merchant_notes = order.notes;
    }

    return { success: true, data: body };
}

// =============================================
// HELPERS
// =============================================

/**
 * Fetch city mappings from DB.
 */
export async function getCityMappings(): Promise<WaseetCityMapping[]> {
    const supabaseAdmin = createSupabaseServiceClient();
    const { data, error } = await supabaseAdmin
        .from("waseet_city_mappings")
        .select("*")
        .eq("is_active", true);

    if (error) {
        console.error("[Waseet] Failed to fetch city mappings:", error);
        return [];
    }

    return data || [];
}

/**
 * Get the default package size ID from cached settings.
 * Falls back to 1 if not configured.
 */
export async function getDefaultPackageSizeId(): Promise<number> {
    const supabaseAdmin = createSupabaseServiceClient();
    const { data } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "waseet_default_package_size")
        .single();

    return data?.value?.id ? Number(data.value.id) : 1;
}

/**
 * Test the Al-Waseet connection by calling /statuses.
 */
export async function testConnection(): Promise<WaseetApiResult<WaseetStatus[]>> {
    return fetchStatuses();
}

// =============================================
// LOCATION CATALOGUE SYNC
// =============================================

export interface LocationSyncResult {
    cities: number;
    regions: number;
    failedCities: number[];
    duplicates: number;
    districts: number;
    splitNames: number;
    reviewPairs: number;
}

/**
 * Refresh the local mirror of Al-Waseet's delivery destinations into
 * `waseet_cities` / `waseet_regions`.
 *
 * An Al-Waseet order can only be created with a `region_id` that exists in
 * their catalogue, so checkout reads the mirror instead of calling their API
 * per keystroke. Both source endpoints are unauthenticated, but they still
 * count against the 30-req/30s budget, hence the shared rate limiter.
 *
 * Rows are upserted, never deleted: an id that disappears upstream may still
 * be referenced by an order we already shipped.
 */
export async function syncLocationCatalog(triggeredBy = "manual"): Promise<WaseetApiResult<LocationSyncResult>> {
    const supabaseAdmin = createSupabaseServiceClient();

    const citiesResult = await waseetRequest<WaseetCity[]>("citys", "GET", undefined, undefined, {
        requiresAuth: false,
        triggeredBy,
    });

    if (!citiesResult.success || !citiesResult.data) {
        return { success: false, error: citiesResult.error || "Al-Waseet returned no cities" };
    }

    const cityRows = citiesResult.data.map(c => ({
        id: Number(c.id),
        name_ar: c.city_name,
        synced_at: new Date().toISOString(),
    }));

    const { error: cityError } = await supabaseAdmin
        .from("waseet_cities")
        .upsert(cityRows, { onConflict: "id" });

    if (cityError) {
        return { success: false, error: `Failed to upsert cities: ${cityError.message}` };
    }

    let regionCount = 0;
    const failedCities: number[] = [];

    for (const city of cityRows) {
        const regionsResult = await waseetRequest<WaseetRegion[]>("regions", "GET", { city_id: city.id }, undefined, {
            requiresAuth: false,
            triggeredBy,
        });

        if (!regionsResult.success || !regionsResult.data) {
            failedCities.push(city.id);
            continue;
        }

        const regionRows = regionsResult.data.map(r => ({
            id: Number(r.id),
            city_id: city.id,
            name_ar: r.region_name,
            synced_at: new Date().toISOString(),
        }));

        if (regionRows.length === 0) continue;

        const { error: regionError } = await supabaseAdmin
            .from("waseet_regions")
            .upsert(regionRows, { onConflict: "id" });

        if (regionError) {
            failedCities.push(city.id);
            continue;
        }

        regionCount += regionRows.length;
    }

    // Name cleaning is done by generated columns, so it is already applied by
    // the time the upsert returns. Grouping is not: duplicates, districts and
    // the review queue all have to look across sibling rows, so they are
    // rebuilt here — in this order, since districts read the canonical names
    // and the review queue only compares canonical rows.
    const { data: duplicates, error: canonicalError } = await supabaseAdmin
        .rpc("waseet_refresh_canonical_regions");

    if (canonicalError) {
        return { success: false, error: `Failed to refresh canonical regions: ${canonicalError.message}` };
    }

    // Districts, the un-glue pass and districts again: splitting a run-together
    // name needs the district vocabulary, and the split then exposes districts
    // that were hidden inside a glued token.
    const { error: firstDistrictError } = await supabaseAdmin.rpc("waseet_refresh_districts");

    if (firstDistrictError) {
        return { success: false, error: `Failed to refresh districts: ${firstDistrictError.message}` };
    }

    const { data: splitCount, error: splitError } = await supabaseAdmin
        .rpc("waseet_refresh_split_names");

    if (splitError) {
        return { success: false, error: `Failed to split run-together names: ${splitError.message}` };
    }

    const { data: districtRows, error: districtError } = await supabaseAdmin
        .rpc("waseet_refresh_districts");

    if (districtError) {
        return { success: false, error: `Failed to refresh districts: ${districtError.message}` };
    }

    // Reference data that hangs off the names: the official postal code, and
    // the curated area -> municipality gazetteer. Both key off the cleaned
    // names, so they run after the split.
    const { error: postalError } = await supabaseAdmin.rpc("waseet_refresh_postal_codes");

    if (postalError) {
        return { success: false, error: `Failed to match postal codes: ${postalError.message}` };
    }

    const { error: municipalityError } = await supabaseAdmin.rpc("waseet_refresh_municipalities");

    if (municipalityError) {
        return { success: false, error: `Failed to match municipalities: ${municipalityError.message}` };
    }

    const { data: reviewPairs, error: reviewError } = await supabaseAdmin
        .rpc("waseet_refresh_region_review");

    if (reviewError) {
        return { success: false, error: `Failed to refresh the region review queue: ${reviewError.message}` };
    }

    return {
        success: true,
        data: {
            cities: cityRows.length,
            regions: regionCount,
            failedCities,
            duplicates: duplicates ?? 0,
            districts: districtRows?.[0]?.districts ?? 0,
            splitNames: splitCount ?? 0,
            reviewPairs: reviewPairs ?? 0,
        },
    };
}
