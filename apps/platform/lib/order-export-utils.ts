"use client";

import { Order } from "@/lib/supabase";
import { cleanPhoneForExport } from "@/lib/export-utils";
import { mergeOrderItems } from "@/lib/merge-order-items";

/**
 * Order Export Utilities
 * 
 * Functions for exporting orders to various formats (CSV, Excel).
 * Extracted from use-orders.ts for better organization.
 */

// =============================================
// EXPORT HEADERS
// =============================================

export const ORDER_EXPORT_HEADERS = [
    "Order ID",
    "Customer Name",
    "Phone",
    "City",
    "Address",
    "Items",
    "Total",
    "Status",
    "Payment Status",
    "Created At",
];

// =============================================
// ROW FORMATTING
// =============================================

/**
 * Format an order as an export row
 */
export function formatOrderRow(order: Order): (string | number)[] {
    return [
        order.order_id,
        order.customer_name,
        cleanPhoneForExport(order.phone),
        order.city || "",
        order.address_details || "",
        mergeOrderItems(order.items).map((i) => `${i.name} x${i.quantity}`).join("; ") || "",
        order.price,
        order.status,
        order.payment_status,
        new Date(order.created_at).toLocaleDateString(),
    ];
}

// =============================================
// FILE DOWNLOAD UTILITIES
// =============================================

/**
 * Trigger a file download in the browser
 */
export function downloadFile(
    content: string,
    filename: string,
    mimeType: string
): void {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Generate filename with date suffix
 */
export function generateExportFilename(
    prefix: string,
    extension: string
): string {
    const dateSuffix = new Date().toISOString().split("T")[0];
    return `${prefix}_${dateSuffix}.${extension}`;
}

// =============================================
// EXPORT FUNCTIONS
// =============================================

/**
 * Quote a value for CSV.
 *
 * Cells were wrapped in quotes without escaping the quotes inside them, so a
 * single `"` in a customer name or address ended the field early and shifted
 * every remaining column on that row. No live order contains one today, which is
 * why it had not surfaced, but 11 real orders do contain newlines — those are
 * only safe because the value is quoted, so the quoting has to be correct.
 * RFC 4180: double the quote character.
 */
function toCsvCell(cell: string | number): string {
    return `"${String(cell).replace(/"/g, '""')}"`;
}

/**
 * Export orders to CSV format
 */
export function exportOrdersToCSV(orders: Order[]): {
    success: boolean;
    count: number;
} {
    const rows = orders.map(formatOrderRow);

    const csvContent = [
        ORDER_EXPORT_HEADERS.join(","),
        ...rows.map((row) => row.map(toCsvCell).join(",")),
    ].join("\n");

    downloadFile(
        csvContent,
        generateExportFilename("orders_export", "csv"),
        "text/csv"
    );

    return { success: true, count: orders.length };
}

/**
 * Export orders to Excel-compatible TSV format
 */
export function exportOrdersToExcel(orders: Order[]): {
    success: boolean;
    count: number;
} {
    const rows = orders.map(formatOrderRow);

    const tsvContent = [
        ORDER_EXPORT_HEADERS.join("\t"),
        ...rows.map((row) => row.map((cell) => `${cell}`).join("\t")),
    ].join("\n");

    downloadFile(
        tsvContent,
        generateExportFilename("orders_export", "xls"),
        "application/vnd.ms-excel"
    );

    return { success: true, count: orders.length };
}

/**
 * Export orders in specified format
 */
export function exportOrders(
    orders: Order[],
    format: "csv" | "xlsx" = "csv"
): { success: boolean; count: number } {
    if (format === "csv") {
        return exportOrdersToCSV(orders);
    }
    return exportOrdersToExcel(orders);
}

// =============================================
// DELIVERY EXPORT FORMAT
// =============================================

export const DELIVERY_EXPORT_HEADERS = [
    "الرقم",
    "اسم العميل",
    "رقم الهاتف",
    "المحافظة",
    "العنوان",
    "المنتجات",
    "المبلغ",
];

/**
 * Format order for delivery company export
 */
export function formatDeliveryRow(
    order: Order,
    index: number
): (string | number)[] {
    return [
        index + 1,
        order.customer_name,
        cleanPhoneForExport(order.phone),
        order.city || "",
        order.address_details || "",
        mergeOrderItems(order.items).map((i) => i.name).join("، ") || "",
        order.price,
    ];
}

/**
 * Export orders for delivery company (Arabic format)
 */
export function exportForDelivery(orders: Order[]): {
    success: boolean;
    count: number;
} {
    const rows = orders.map((order, i) => formatDeliveryRow(order, i));

    const csvContent = [
        DELIVERY_EXPORT_HEADERS.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Add UTF-8 BOM for Arabic support
    const BOM = "\uFEFF";
    downloadFile(
        BOM + csvContent,
        generateExportFilename("delivery_orders", "csv"),
        "text/csv"
    );

    return { success: true, count: orders.length };
}
