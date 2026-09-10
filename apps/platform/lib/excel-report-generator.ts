"use client";

import type ExcelJS from "exceljs";
import { Order } from "@/lib/supabase";
import { formatOrderNamedDate } from "@/lib/order-format-utils";

// ============================================
// TYPES
// ============================================

export interface ExcelReportOptions {
    title: string;
    dateRange: { from: string; to: string };
    reportType: "order_list" | "summary";
    orders: Order[];
}

// ============================================
// COLOR CONSTANTS
// ============================================

const COLORS = {
    headerBg: "FF1E1E1E",        // Dark charcoal
    headerText: "FFEFFF00",      // Neon yellow
    headerBorder: "FF3A3A3A",
    white: "FFFFFFFF",
    lightGray: "FFF8F8F8",
    border: "FFE5E5E5",
    text: "FF333333",
    textMuted: "FF888888",
    accent: "FFEFFF00",
    // Status backgrounds
    statusNewBg: "FFDBEAFE",
    statusNewText: "FF1E40AF",
    statusContactedBg: "FFEDE9FE",
    statusContactedText: "FF5B21B6",
    statusConfirmedBg: "FFD1FAE5",
    statusConfirmedText: "FF065F46",
    statusInTransitBg: "FFFED7AA",
    statusInTransitText: "FF9A3412",
    statusDeliveredBg: "FFDCFCE7",
    statusDeliveredText: "FF166534",
    statusCompletedBg: "FFCCFBF1",
    statusCompletedText: "FF115E59",
    statusRejectedBg: "FFFEE2E2",
    statusRejectedText: "FF991B1B",
    statusCancelledBg: "FFF3F4F6",
    statusCancelledText: "FF4B5563",
    statusNoResponseBg: "FFFEF3C7",
    statusNoResponseText: "FF92400E",
    statusReturnBg: "FFFFEDD5",
    statusReturnText: "FF9A3412",
    // KPI colors
    kpiBlueBg: "FFDBEAFE",
    kpiGreenBg: "FFDCFCE7",
    kpiAmberBg: "FFFEF3C7",
    kpiRedBg: "FFFEE2E2",
    kpiPurpleBg: "FFEDE9FE",
};

const STATUS_STYLE_MAP: Record<string, { bg: string; text: string }> = {
    new: { bg: COLORS.statusNewBg, text: COLORS.statusNewText },
    contacted: { bg: COLORS.statusContactedBg, text: COLORS.statusContactedText },
    confirmed: { bg: COLORS.statusConfirmedBg, text: COLORS.statusConfirmedText },
    in_transit: { bg: COLORS.statusInTransitBg, text: COLORS.statusInTransitText },
    delivered: { bg: COLORS.statusDeliveredBg, text: COLORS.statusDeliveredText },
    completed: { bg: COLORS.statusCompletedBg, text: COLORS.statusCompletedText },
    rejected: { bg: COLORS.statusRejectedBg, text: COLORS.statusRejectedText },
    cancelled: { bg: COLORS.statusCancelledBg, text: COLORS.statusCancelledText },
    no_response: { bg: COLORS.statusNoResponseBg, text: COLORS.statusNoResponseText },
    return_pending: { bg: COLORS.statusReturnBg, text: COLORS.statusReturnText },
    refund_delivered: { bg: COLORS.statusCompletedBg, text: COLORS.statusCompletedText },
    refund_failed: { bg: COLORS.statusRejectedBg, text: COLORS.statusRejectedText },
    pending_checkout: { bg: COLORS.statusContactedBg, text: COLORS.statusContactedText },
};

const STATUS_LABELS: Record<string, string> = {
    new: "New",
    contacted: "Contacted",
    confirmed: "Confirmed",
    in_transit: "In Transit",
    delivered: "Delivered",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
    no_response: "No Response",
    return_pending: "Return Pending",
    refund_delivered: "Refund Delivered",
    refund_failed: "Refund Failed",
    pending_checkout: "Pending Checkout",
};

// ============================================
// HELPER
// ============================================

function formatIQDNumber(amount: number): string {
    return new Intl.NumberFormat("en-IQ", {
        style: "currency",
        currency: "IQD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function applyHeaderStyle(row: ExcelJS.Row, columnCount: number) {
    row.height = 28;
    row.eachCell((cell, colNumber) => {
        if (colNumber <= columnCount) {
            cell.font = { bold: true, color: { argb: COLORS.headerText }, size: 10, name: "Segoe UI" };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
            cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
            cell.border = {
                bottom: { style: "medium", color: { argb: COLORS.accent } },
            };
        }
    });
}

function applyDataRowStyle(row: ExcelJS.Row, columnCount: number, isAlt: boolean) {
    row.height = 22;
    row.eachCell((cell, colNumber) => {
        if (colNumber <= columnCount) {
            cell.font = { size: 10, name: "Segoe UI", color: { argb: COLORS.text } };
            cell.alignment = { vertical: "middle", wrapText: false };
            if (isAlt) {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.lightGray } };
            }
            cell.border = {
                bottom: { style: "thin", color: { argb: COLORS.border } },
            };
        }
    });
}

function applyStatusStyle(cell: ExcelJS.Cell, status: string) {
    const style = STATUS_STYLE_MAP[status];
    if (style) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.bg } };
        cell.font = { bold: true, size: 10, name: "Segoe UI", color: { argb: style.text } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
    }
}

// ============================================
// EXCEL GENERATION
// ============================================

export async function generateExcelReport(options: ExcelReportOptions): Promise<void> {
    const { default: ExcelJSLib } = await import("exceljs");

    const { title, dateRange, reportType, orders } = options;
    const workbook = new ExcelJSLib.Workbook();
    workbook.creator = "Schneider OMS";
    workbook.created = new Date();

    // Calculate stats
    const byStatus: Record<string, number> = {};
    let totalRevenue = 0;
    let totalDeliveryFees = 0;
    const byCityMap: Record<string, { total: number; delivered: number; rejected: number; revenue: number }> = {};
    const byPayment: Record<string, { count: number; revenue: number }> = {};

    orders.forEach((order) => {
        byStatus[order.status] = (byStatus[order.status] || 0) + 1;
        const price = Number(order.price) || 0;
        if (!order.is_return) totalRevenue += price;
        if (order.delivery_fee) totalDeliveryFees += order.delivery_fee;
        if (order.delivery_cost) totalDeliveryFees += order.delivery_cost;

        const city = order.city || order.governorate_code || "Unknown";
        if (!byCityMap[city]) byCityMap[city] = { total: 0, delivered: 0, rejected: 0, revenue: 0 };
        byCityMap[city].total++;
        if (!order.is_return) byCityMap[city].revenue += price;
        if (order.status === "delivered" || order.status === "completed") byCityMap[city].delivered++;
        if (order.status === "rejected") byCityMap[city].rejected++;

        const payStatus = order.payment_status || "pending";
        if (!byPayment[payStatus]) byPayment[payStatus] = { count: 0, revenue: 0 };
        byPayment[payStatus].count++;
        if (!order.is_return) byPayment[payStatus].revenue += price;
    });

    const delivered = (byStatus["delivered"] || 0) + (byStatus["completed"] || 0);
    const rejected = byStatus["rejected"] || 0;
    const shipped = delivered + rejected;
    const deliveryRate = shipped > 0 ? (delivered / shipped) * 100 : 0;
    const rejectionRate = shipped > 0 ? (rejected / shipped) * 100 : 0;
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    const fromDate = new Date(dateRange.from + "T00:00:00");
    const toDate = new Date(dateRange.to + "T00:00:00");
    const dateStr = `${fromDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} — ${toDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    // ============================================
    // SHEET 1: SUMMARY
    // ============================================
    const summarySheet = workbook.addWorksheet("Summary", {
        properties: { tabColor: { argb: "FF1E1E1E" } },
    });

    // Title row
    summarySheet.mergeCells("A1:F1");
    const titleCell = summarySheet.getCell("A1");
    titleCell.value = "SCHNEIDER";
    titleCell.font = { bold: true, size: 24, color: { argb: COLORS.headerText }, name: "Segoe UI" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    summarySheet.getRow(1).height = 45;

    // Subtitle row
    summarySheet.mergeCells("A2:F2");
    const subtitleCell = summarySheet.getCell("A2");
    subtitleCell.value = `${title} — ${dateStr}`;
    subtitleCell.font = { size: 11, color: { argb: COLORS.textMuted }, name: "Segoe UI" };
    subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
    summarySheet.getRow(2).height = 25;

    // Accent bar
    summarySheet.mergeCells("A3:F3");
    const accentCell = summarySheet.getCell("A3");
    accentCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.accent } };
    summarySheet.getRow(3).height = 4;

    // KPI Section Header
    summarySheet.getRow(5).height = 22;
    summarySheet.getCell("A5").value = "KEY PERFORMANCE INDICATORS";
    summarySheet.getCell("A5").font = { bold: true, size: 11, color: { argb: COLORS.text }, name: "Segoe UI" };

    // KPI Cards (using cells)
    const kpiData = [
        { label: "Total Orders", value: orders.length, bg: COLORS.kpiBlueBg },
        { label: "Revenue", value: formatIQDNumber(totalRevenue), bg: COLORS.kpiGreenBg },
        { label: "Delivery Rate", value: `${deliveryRate.toFixed(1)}%`, bg: COLORS.kpiGreenBg },
        { label: "Rejection Rate", value: `${rejectionRate.toFixed(1)}%`, bg: COLORS.kpiRedBg },
        { label: "Avg Order Value", value: formatIQDNumber(avgOrderValue), bg: COLORS.kpiPurpleBg },
    ];

    // KPI Labels Row
    const labelRow = summarySheet.getRow(6);
    labelRow.height = 20;
    kpiData.forEach((kpi, i) => {
        const cell = labelRow.getCell(i + 1);
        cell.value = kpi.label;
        cell.font = { size: 8, color: { argb: COLORS.textMuted }, name: "Segoe UI" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: kpi.bg } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
            top: { style: "thin", color: { argb: COLORS.border } },
            left: { style: "thin", color: { argb: COLORS.border } },
            right: { style: "thin", color: { argb: COLORS.border } },
        };
    });

    // KPI Values Row
    const valueRow = summarySheet.getRow(7);
    valueRow.height = 30;
    kpiData.forEach((kpi, i) => {
        const cell = valueRow.getCell(i + 1);
        cell.value = kpi.value;
        cell.font = { bold: true, size: 16, color: { argb: COLORS.text }, name: "Segoe UI" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: kpi.bg } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
            bottom: { style: "thin", color: { argb: COLORS.border } },
            left: { style: "thin", color: { argb: COLORS.border } },
            right: { style: "thin", color: { argb: COLORS.border } },
        };
    });

    // Status Breakdown
    const statusStartRow = 10;
    summarySheet.getCell(`A${statusStartRow}`).value = "STATUS BREAKDOWN";
    summarySheet.getCell(`A${statusStartRow}`).font = { bold: true, size: 11, color: { argb: COLORS.text }, name: "Segoe UI" };

    const statusHeaderRow = summarySheet.getRow(statusStartRow + 1);
    ["Status", "Count", "Percentage"].forEach((header, i) => {
        statusHeaderRow.getCell(i + 1).value = header;
    });
    applyHeaderStyle(statusHeaderRow, 3);

    const sortedStatuses = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
    sortedStatuses.forEach(([status, count], i) => {
        const row = summarySheet.getRow(statusStartRow + 2 + i);
        row.getCell(1).value = STATUS_LABELS[status] || status;
        row.getCell(2).value = count;
        row.getCell(3).value = `${((count / orders.length) * 100).toFixed(1)}%`;
        applyDataRowStyle(row, 3, i % 2 === 1);
        applyStatusStyle(row.getCell(1), status);
    });

    // Payment Breakdown
    const paymentStartRow = statusStartRow + 2 + sortedStatuses.length + 2;
    summarySheet.getCell(`A${paymentStartRow}`).value = "PAYMENT STATUS";
    summarySheet.getCell(`A${paymentStartRow}`).font = { bold: true, size: 11, color: { argb: COLORS.text }, name: "Segoe UI" };

    const paymentLabels: Record<string, string> = {
        pending: "Pending", cod: "Cash on Delivery", prepaid: "Prepaid", partial: "Partial", paid: "Paid",
    };

    const paymentHeaderRow = summarySheet.getRow(paymentStartRow + 1);
    ["Payment Type", "Orders", "Revenue"].forEach((header, i) => {
        paymentHeaderRow.getCell(i + 1).value = header;
    });
    applyHeaderStyle(paymentHeaderRow, 3);

    const sortedPayments = Object.entries(byPayment).sort((a, b) => b[1].count - a[1].count);
    sortedPayments.forEach(([status, data], i) => {
        const row = summarySheet.getRow(paymentStartRow + 2 + i);
        row.getCell(1).value = paymentLabels[status] || status;
        row.getCell(2).value = data.count;
        row.getCell(3).value = formatIQDNumber(data.revenue);
        applyDataRowStyle(row, 3, i % 2 === 1);
    });

    // Set column widths for summary
    summarySheet.columns = [
        { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 22 },
    ];

    // ============================================
    // SHEET 2: ORDER DETAILS
    // ============================================
    if (reportType === "order_list") {
        const ordersSheet = workbook.addWorksheet("Order Details", {
            properties: { tabColor: { argb: "FF3B82F6" } },
            views: [{ state: "frozen", ySplit: 1 }],
        });

        // Headers
        const headers = ["Order ID", "Customer", "Phone", "City", "Items", "Total (IQD)", "Status", "Payment", "Source", "Date"];
        const headerRowOrders = ordersSheet.getRow(1);
        headers.forEach((header, i) => {
            headerRowOrders.getCell(i + 1).value = header;
        });
        applyHeaderStyle(headerRowOrders, headers.length);

        // Data rows
        orders.forEach((order, i) => {
            const row = ordersSheet.getRow(i + 2);
            row.getCell(1).value = order.order_id || order.id.slice(0, 8);
            row.getCell(2).value = order.customer_name;
            // Phone as text to preserve format
            const phoneCell = row.getCell(3);
            phoneCell.value = order.phone || "—";
            phoneCell.numFmt = "@"; // Text format
            row.getCell(4).value = order.city || "—";
            row.getCell(5).value = order.items?.map((item) => `${item.name} x${item.quantity}`).join(", ") || "—";
            row.getCell(6).value = Number(order.price) || 0;
            row.getCell(6).numFmt = "#,##0";
            row.getCell(7).value = STATUS_LABELS[order.status] || order.status;
            row.getCell(8).value = (order.payment_status || "pending").toUpperCase();
            row.getCell(9).value = (order.source || "—").toUpperCase();
            row.getCell(10).value = formatOrderNamedDate(order.created_at);

            applyDataRowStyle(row, headers.length, i % 2 === 1);
            applyStatusStyle(row.getCell(7), order.status);
        });

        // Column widths
        ordersSheet.columns = [
            { width: 14 }, // Order ID
            { width: 22 }, // Customer
            { width: 16 }, // Phone
            { width: 16 }, // City
            { width: 35 }, // Items
            { width: 14 }, // Total
            { width: 16 }, // Status
            { width: 12 }, // Payment
            { width: 12 }, // Source
            { width: 14 }, // Date
        ];

        // Auto-filter
        ordersSheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: orders.length + 1, column: headers.length },
        };

        // Totals row
        const totalRow = ordersSheet.getRow(orders.length + 2);
        totalRow.getCell(1).value = "TOTAL";
        totalRow.getCell(1).font = { bold: true, size: 11, name: "Segoe UI", color: { argb: COLORS.text } };
        totalRow.getCell(5).value = `${orders.length} orders`;
        totalRow.getCell(5).font = { bold: true, size: 10, name: "Segoe UI", color: { argb: COLORS.text } };
        totalRow.getCell(6).value = totalRevenue;
        totalRow.getCell(6).numFmt = "#,##0";
        totalRow.getCell(6).font = { bold: true, size: 11, name: "Segoe UI", color: { argb: "FF166534" } };
        totalRow.height = 26;
        totalRow.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.kpiGreenBg } };
            cell.border = { top: { style: "medium", color: { argb: COLORS.accent } } };
        });
    }

    // ============================================
    // SHEET 3: CITY PERFORMANCE
    // ============================================
    const byCity = Object.entries(byCityMap)
        .map(([city, data]) => ({
            city,
            ...data,
            deliveryRate: (data.delivered + data.rejected) > 0
                ? (data.delivered / (data.delivered + data.rejected)) * 100
                : 0,
        }))
        .sort((a, b) => b.total - a.total);

    if (byCity.length > 0) {
        const citySheet = workbook.addWorksheet("City Performance", {
            properties: { tabColor: { argb: "FF10B981" } },
            views: [{ state: "frozen", ySplit: 1 }],
        });

        const cityHeaders = ["City", "Total Orders", "Delivered", "Rejected", "Delivery Rate", "Revenue"];
        const cityHeaderRow = citySheet.getRow(1);
        cityHeaders.forEach((header, i) => {
            cityHeaderRow.getCell(i + 1).value = header;
        });
        applyHeaderStyle(cityHeaderRow, cityHeaders.length);

        byCity.forEach((city, i) => {
            const row = citySheet.getRow(i + 2);
            row.getCell(1).value = city.city;
            row.getCell(2).value = city.total;
            row.getCell(3).value = city.delivered;
            row.getCell(4).value = city.rejected;
            row.getCell(5).value = `${city.deliveryRate.toFixed(1)}%`;
            row.getCell(6).value = city.revenue;
            row.getCell(6).numFmt = "#,##0";

            applyDataRowStyle(row, cityHeaders.length, i % 2 === 1);

            // Color-code delivery rate
            const rateCell = row.getCell(5);
            rateCell.alignment = { horizontal: "center", vertical: "middle" };
            rateCell.font = { bold: true, size: 10, name: "Segoe UI" };
            if (city.deliveryRate >= 85) {
                rateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.statusDeliveredBg } };
                rateCell.font.color = { argb: COLORS.statusDeliveredText };
            } else if (city.deliveryRate >= 70) {
                rateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.statusNoResponseBg } };
                rateCell.font.color = { argb: COLORS.statusNoResponseText };
            } else if (city.deliveryRate > 0) {
                rateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.statusRejectedBg } };
                rateCell.font.color = { argb: COLORS.statusRejectedText };
            }
        });

        // Totals row
        const cityTotalRow = citySheet.getRow(byCity.length + 2);
        cityTotalRow.getCell(1).value = "TOTAL";
        cityTotalRow.getCell(1).font = { bold: true, size: 11, name: "Segoe UI" };
        cityTotalRow.getCell(2).value = orders.length;
        cityTotalRow.getCell(3).value = delivered;
        cityTotalRow.getCell(4).value = rejected;
        cityTotalRow.getCell(5).value = `${deliveryRate.toFixed(1)}%`;
        cityTotalRow.getCell(6).value = totalRevenue;
        cityTotalRow.getCell(6).numFmt = "#,##0";
        cityTotalRow.height = 26;
        cityTotalRow.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.kpiGreenBg } };
            cell.font = { ...cell.font, bold: true, size: 10, name: "Segoe UI" };
            cell.border = { top: { style: "medium", color: { argb: COLORS.accent } } };
        });

        citySheet.columns = [
            { width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 18 },
        ];

        citySheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: byCity.length + 1, column: cityHeaders.length },
        };
    }

    // ============================================
    // SHEET 4: FINANCIAL
    // ============================================
    const financeSheet = workbook.addWorksheet("Financial", {
        properties: { tabColor: { argb: "FF22C55E" } },
    });

    // Title
    financeSheet.mergeCells("A1:C1");
    const finTitleCell = financeSheet.getCell("A1");
    finTitleCell.value = "FINANCIAL SUMMARY";
    finTitleCell.font = { bold: true, size: 14, color: { argb: COLORS.headerText }, name: "Segoe UI" };
    finTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    finTitleCell.alignment = { horizontal: "center", vertical: "middle" };
    financeSheet.getRow(1).height = 35;

    financeSheet.mergeCells("A2:C2");
    const finSubCell = financeSheet.getCell("A2");
    finSubCell.value = dateStr;
    finSubCell.font = { size: 9, color: { argb: COLORS.textMuted }, name: "Segoe UI" };
    finSubCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    finSubCell.alignment = { horizontal: "center", vertical: "middle" };

    // Revenue section
    const finItems = [
        { label: "Total Revenue", value: formatIQDNumber(totalRevenue), bold: true },
        { label: "Total Orders", value: String(orders.length), bold: false },
        { label: "Average Order Value", value: formatIQDNumber(avgOrderValue), bold: false },
        { label: "Total Delivery Fees", value: formatIQDNumber(totalDeliveryFees), bold: false },
        { label: "Net Revenue (after delivery)", value: formatIQDNumber(totalRevenue - totalDeliveryFees), bold: true },
        { label: "", value: "", bold: false }, // Spacer
        { label: "DELIVERY PERFORMANCE", value: "", bold: true },
        { label: "Delivered Orders", value: String(delivered), bold: false },
        { label: "Rejected Orders", value: String(rejected), bold: false },
        { label: "Delivery Rate", value: `${deliveryRate.toFixed(1)}%`, bold: false },
        { label: "Rejection Rate", value: `${rejectionRate.toFixed(1)}%`, bold: false },
    ];

    finItems.forEach((item, i) => {
        const row = financeSheet.getRow(i + 4);
        row.getCell(1).value = item.label;
        row.getCell(2).value = item.value;
        row.getCell(1).font = {
            bold: item.bold,
            size: item.bold ? 11 : 10,
            name: "Segoe UI",
            color: { argb: item.label === "DELIVERY PERFORMANCE" ? COLORS.headerText : COLORS.text },
        };
        row.getCell(2).font = {
            bold: item.bold,
            size: item.bold ? 12 : 10,
            name: "Segoe UI",
            color: { argb: COLORS.text },
        };
        row.getCell(2).alignment = { horizontal: "right" };
        if (item.label === "DELIVERY PERFORMANCE") {
            row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
            row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
            row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
        }
        if (item.bold && item.label !== "DELIVERY PERFORMANCE" && item.label !== "") {
            row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.kpiGreenBg } };
            row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.kpiGreenBg } };
        }
        row.height = 24;
    });

    financeSheet.columns = [
        { width: 30 }, { width: 25 }, { width: 15 },
    ];

    // ============================================
    // SAVE FILE
    // ============================================
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateSuffix = new Date().toISOString().split("T")[0];
    link.href = url;
    link.download = `Schneider_Report_${dateSuffix}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
