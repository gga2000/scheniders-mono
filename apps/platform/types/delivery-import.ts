import type { Order } from "./order";

// =============================================
// DELIVERY IMPORT TYPES
// PDF parsing, order matching, and audit trail
// =============================================

// --- PDF Parsing Types ---

export interface ParsedPDFHeader {
    merchantName: string;
    paymentDate: string;      // "2026-03-07 16:43:12"
    receiptNumber: string;    // "2515460"
    receivingAgent: string;   // "عباس"
    totalShipments: number;   // 120
}

export interface ParsedPDFFinancials {
    previousBalanceDebit: number;
    previousBalanceCredit: number;
    netReceiptsAmount: number;
    amountPaid: number;
    newBalanceDebit: number;
    newBalanceCredit: number;
}

export interface ParsedPDFRow {
    rowNumber: number;
    storeName: string;
    shipmentNumber: string;    // maps to order_id in our DB
    address: string;
    phone: string;             // 07XXXXXXXXX format
    shipmentAmount: number;    // can be negative or 0
    deliveryFee: number;
    netToMerchant: number;     // can be negative
    status: string;            // raw Arabic status text
    itemCount: number;
    entryDate: string;         // YYYY-MM-DD
    notes: string;
    // Derived flags
    isNegative: boolean;
    isPriceChanged: boolean;
    isPartialDelivery: boolean;
    originalPrice?: number;    // parsed from price-change status text
    newPrice?: number;         // parsed from price-change status text
    isReorder: boolean;
    reorderReference?: string; // e.g., "LF-5358-029" or "10060"
}

export interface ParsedDeliveryPDF {
    header: ParsedPDFHeader;
    financials: ParsedPDFFinancials;
    rows: ParsedPDFRow[];
    footerTotal: number;       // مبلغ الوصولات بعد التوصيل
    validationErrors: string[];
}

// --- Matching Types ---

export type MatchCategory =
    | "clean"
    | "price_changed"
    | "partial_delivery"
    | "amount_mismatch"
    | "phone_mismatch"
    | "negative_refund"
    | "not_found"
    | "already_delivered"
    | "wrong_status"
    | "reorder";

export interface MatchedRow {
    pdfRow: ParsedPDFRow;
    order: Order | null;
    category: MatchCategory;
    matchDetails: string;
    matchedBy: "order_id" | "phone" | "none";
    amountDifference?: number;
}

export interface DeliveryImportSummary {
    totalRows: number;
    cleanMatches: number;
    needsReview: number;
    critical: number;
    informational: number;
    totalDeliveriesAmount: number;
    totalRefundsAmount: number;
    totalDeliveryFees: number;
    netAmount: number;
}

export interface DeliveryImportResult {
    parsedPDF: ParsedDeliveryPDF;
    matches: MatchedRow[];
    summary: DeliveryImportSummary;
}

// --- Audit Trail Types (database records) ---

export interface DeliveryImport {
    id: string;
    receipt_number: string;
    payment_date: string;
    receiving_agent: string | null;
    total_orders: number;
    total_amount: number;
    processed_count: number;
    skipped_count: number;
    failed_count: number;
    status: "pending" | "confirmed" | "completed" | "cancelled";
    imported_by: string | null;
    confirmed_by: string | null;
    created_at: string;
    confirmed_at: string | null;
    pdf_filename: string | null;
    raw_data: ParsedDeliveryPDF;
    actual_amount_received?: number | null;
}

export interface DeliveryImportItem {
    id: string;
    import_id: string;
    order_id: string | null;
    pdf_row_number: number;
    pdf_shipment_number: string | null;
    pdf_phone: string | null;
    pdf_amount: number | null;
    pdf_delivery_fee: number | null;
    pdf_net_amount: number | null;
    pdf_status: string | null;
    pdf_item_count: number | null;
    pdf_notes: string | null;
    match_category: MatchCategory;
    match_details: Record<string, unknown> | null;
    action: "pending" | "confirmed" | "skipped" | "failed";
    previous_status: string | null;
    new_status: string | null;
    created_at: string;
}
