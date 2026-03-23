// =============================================
// AL-WASEET DELIVERY API TYPES
// API Docs: https://al-waseet.com/apis-main/index#Integration
// Base URL: https://api.alwaseet-iq.net/v1/merchant/
// =============================================

// --- Standard API response wrapper ---

export interface WaseetApiResponse<T> {
    status: boolean;
    errNum: string;   // "S000" on success, "999" on error
    msg: string;
    data: T;
}

export interface WaseetApiResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    httpStatus?: number;
}

// --- Auth ---

export interface WaseetLoginData {
    token: string;
}

// --- Cities & Regions ---

export interface WaseetCity {
    id: string;
    city_name: string;
}

export interface WaseetRegion {
    id: string;
    region_name: string;
}

// --- Package Sizes ---

export interface WaseetPackageSize {
    id: string;
    size: string;
}

// --- Order Statuses ---

export interface WaseetStatus {
    id: string;
    status: string;
}

// --- Create Order ---

export interface WaseetCreateOrderBody {
    client_name: string;
    client_mobile: string;          // Format: "+9647000000000"
    client_mobile2?: string;        // Format: "+9647000000000"
    city_id: number;
    region_id: number;
    location: string;
    type_name: string;
    items_number: number;
    price: number;                  // Total WITH delivery fee
    package_size: number;
    merchant_notes?: string;
    replacement: 0 | 1;
}

export interface WaseetCreateOrderResponse {
    client_name: string;
    client_mobile: string;
    client_mobile2: string;
    city_id: string;
    region_id: string;
    merchant_mobile: string;
    items_number: string;
    price: string;
    package_size: string;
    cash_fee: string;
    location: string;
    merchant_id: string;
    current_city: string;
    merchant_city: string;
    company_price: string;
    city_fees: string;
    merchant_price: string;
    type_name: string;
    merchant_created_at: string;
    merchant_notes: string;
    qr_id: string;
    pickup_id: string;
    pickup_created_at: string;
    id: number;
    qr_link: string;
}

// --- Edit Order ---

export interface WaseetEditOrderBody extends WaseetCreateOrderBody {
    qr_id: string;
}

// --- Merchant Orders ---

export interface WaseetMerchantOrder {
    id: number;
    client_name: string;
    client_mobile: string;
    items_number: string;
    created_at: string;
    city_name: string;
    region_name: string;
    status_id: string;
    status: string;
    price: string;
    location: string;
    issue_notes: string;
    merchant_notes: string;
    client_mobile2: string;
    updated_at: string;
    city_id: string;
    region_id: string;
    replacement: string;
    type_name: string;
    has_merchant_fin_record: 0 | 1;
    deliver_confirmed_fin: 0 | 1;
    delivery_price: string;
    package_size: string;
    merchant_invoice_id: string;
    qr_id?: string;
}

// --- Invoices ---

export interface WaseetInvoice {
    id: string;
    merchant_price: string;
    delivered_orders_count: string;
    replacement_delivered_orders_count: string;
    status: string;
    merchant_id: string;
    updated_at: string;
}

export interface WaseetInvoiceOrdersResponse {
    invoice: WaseetInvoice[];
    orders: WaseetMerchantOrder[];
}

// --- City Mapping (DB table row) ---

export interface WaseetCityMapping {
    id: string;
    created_at: string;
    updated_at: string;
    governorate_code: string;
    governorate_name_ar: string;
    waseet_city_id: number;
    waseet_city_name: string;
    waseet_default_region_id: number | null;
    waseet_default_region_name: string | null;
    is_active: boolean;
}

// --- API Log (DB table row) ---

export interface WaseetApiLog {
    id: string;
    created_at: string;
    endpoint: string;
    method: string;
    request_data: Record<string, unknown> | null;
    response_data: Record<string, unknown> | null;
    http_status: number | null;
    success: boolean;
    error_message: string | null;
    order_id: string | null;
    duration_ms: number | null;
    triggered_by: string;
}

// --- Submission result ---

export interface WaseetSubmitResult {
    orderId: string;
    orderDisplayId: string;
    success: boolean;
    error?: string;
    waseetQrId?: string;
    waseetQrLink?: string;
}

export interface WaseetSubmitSummary {
    submitted: number;
    failed: number;
    results: WaseetSubmitResult[];
}
