"use client";

import { Order } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export interface PDFReportOptions {
    title: string;
    dateRange: { from: string; to: string };
    reportType: "order_list" | "summary";
    orders: Order[];
}

// ============================================
// COLOR PALETTE
// ============================================

const COLORS = {
    primary: [30, 30, 30] as [number, number, number],        // Near-black
    accent: [239, 255, 0] as [number, number, number],         // Neon yellow (brand)
    accentDark: [180, 192, 0] as [number, number, number],     // Darker accent
    white: [255, 255, 255] as [number, number, number],
    lightGray: [245, 245, 245] as [number, number, number],
    mediumGray: [200, 200, 200] as [number, number, number],
    darkGray: [100, 100, 100] as [number, number, number],
    text: [40, 40, 40] as [number, number, number],
    textMuted: [120, 120, 120] as [number, number, number],
    // Status colors
    statusNew: [59, 130, 246] as [number, number, number],
    statusContacted: [139, 92, 246] as [number, number, number],
    statusConfirmed: [16, 185, 129] as [number, number, number],
    statusInTransit: [249, 115, 22] as [number, number, number],
    statusDelivered: [34, 197, 94] as [number, number, number],
    statusCompleted: [20, 184, 166] as [number, number, number],
    statusRejected: [239, 68, 68] as [number, number, number],
    statusCancelled: [107, 114, 128] as [number, number, number],
    statusNoResponse: [245, 158, 11] as [number, number, number],
    statusReturn: [249, 115, 22] as [number, number, number],
    // KPI card colors
    kpiBlue: [219, 234, 254] as [number, number, number],
    kpiGreen: [220, 252, 231] as [number, number, number],
    kpiAmber: [254, 243, 199] as [number, number, number],
    kpiRed: [254, 226, 226] as [number, number, number],
    kpiPurple: [237, 233, 254] as [number, number, number],
};

const STATUS_COLOR_MAP: Record<string, [number, number, number]> = {
    new: COLORS.statusNew,
    contacted: COLORS.statusContacted,
    confirmed: COLORS.statusConfirmed,
    in_transit: COLORS.statusInTransit,
    delivered: COLORS.statusDelivered,
    completed: COLORS.statusCompleted,
    rejected: COLORS.statusRejected,
    cancelled: COLORS.statusCancelled,
    no_response: COLORS.statusNoResponse,
    return_pending: COLORS.statusReturn,
    refund_delivered: COLORS.statusCompleted,
    refund_failed: COLORS.statusRejected,
    pending_checkout: COLORS.statusContacted,
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
// HELPER FUNCTIONS
// ============================================

function getStatusColor(status: string): [number, number, number] {
    return STATUS_COLOR_MAP[status] || COLORS.darkGray;
}

function getStatusLabel(status: string): string {
    return STATUS_LABELS[status] || status;
}

function calculateStats(orders: Order[]) {
    const total = orders.length;
    const byStatus: Record<string, number> = {};
    let totalRevenue = 0;
    let totalDeliveryFees = 0;
    const byCityMap: Record<string, { total: number; delivered: number; rejected: number; revenue: number }> = {};
    const byPayment: Record<string, { count: number; revenue: number }> = {};

    orders.forEach((order) => {
        // Status counts
        byStatus[order.status] = (byStatus[order.status] || 0) + 1;

        // Revenue
        const price = Number(order.price) || 0;
        if (!order.is_return) {
            totalRevenue += price;
        }

        // Delivery fees
        if (order.delivery_fee) totalDeliveryFees += order.delivery_fee;
        if (order.delivery_cost) totalDeliveryFees += order.delivery_cost;

        // City performance
        const city = order.city || order.governorate_code || "Unknown";
        if (!byCityMap[city]) byCityMap[city] = { total: 0, delivered: 0, rejected: 0, revenue: 0 };
        byCityMap[city].total++;
        if (!order.is_return) byCityMap[city].revenue += price;
        if (order.status === "delivered" || order.status === "completed") byCityMap[city].delivered++;
        if (order.status === "rejected") byCityMap[city].rejected++;

        // Payment
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
    const avgOrderValue = total > 0 ? totalRevenue / total : 0;

    const byCity = Object.entries(byCityMap)
        .map(([city, data]) => ({
            city,
            ...data,
            deliveryRate: (data.delivered + data.rejected) > 0
                ? (data.delivered / (data.delivered + data.rejected)) * 100
                : 0,
        }))
        .sort((a, b) => b.total - a.total);

    return {
        total,
        byStatus,
        totalRevenue,
        totalDeliveryFees,
        delivered,
        rejected,
        deliveryRate,
        rejectionRate,
        avgOrderValue,
        byCity,
        byPayment,
    };
}

// ============================================
// PDF GENERATION
// ============================================

export async function generatePDFReport(options: PDFReportOptions): Promise<void> {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
    ]);

    const { title, dateRange, reportType, orders } = options;
    const stats = calculateStats(orders);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    // ============================================
    // PAGE 1: COVER PAGE
    // ============================================

    // Full dark background
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    // Accent bar at top
    doc.setFillColor(...COLORS.accent);
    doc.rect(0, 0, pageWidth, 4, "F");

    // Accent stripe decorative element
    doc.setFillColor(...COLORS.accent);
    doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
    doc.rect(0, 80, pageWidth, 60, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));

    // Company name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(42);
    doc.setTextColor(...COLORS.accent);
    doc.text("SCHNEIDER", pageWidth / 2, 105, { align: "center" });

    // Report title
    doc.setFontSize(16);
    doc.setTextColor(...COLORS.white);
    doc.setFont("helvetica", "normal");
    doc.text(title, pageWidth / 2, 120, { align: "center" });

    // Date range
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.mediumGray);
    const fromDate = new Date(dateRange.from + "T00:00:00");
    const toDate = new Date(dateRange.to + "T00:00:00");
    const dateStr = `${fromDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} — ${toDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
    doc.text(dateStr, pageWidth / 2, 132, { align: "center" });

    // Stats preview on cover
    const coverStatsY = 170;
    const statBoxWidth = contentWidth / 3;

    const coverStats = [
        { label: "TOTAL ORDERS", value: String(stats.total) },
        { label: "REVENUE", value: formatIQD(stats.totalRevenue) },
        { label: "DELIVERY RATE", value: `${stats.deliveryRate.toFixed(1)}%` },
    ];

    coverStats.forEach((stat, i) => {
        const x = margin + i * statBoxWidth;

        // Stat value
        doc.setFont("helvetica", "bold");
        doc.setFontSize(28);
        doc.setTextColor(...COLORS.accent);
        doc.text(stat.value, x + statBoxWidth / 2, coverStatsY, { align: "center" });

        // Stat label
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...COLORS.mediumGray);
        doc.text(stat.label, x + statBoxWidth / 2, coverStatsY + 10, { align: "center" });
    });

    // Footer bar on cover
    doc.setFillColor(...COLORS.accent);
    doc.rect(0, pageHeight - 4, pageWidth, 4, "F");

    // Generated timestamp
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.darkGray);
    const genDate = new Date().toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
    doc.text(`Generated: ${genDate}`, pageWidth / 2, pageHeight - 10, { align: "center" });

    // ============================================
    // PAGE 2: EXECUTIVE SUMMARY
    // ============================================
    doc.addPage();
    let y = margin;

    // --- Page header helper ---
    const drawPageHeader = (pageTitle: string) => {
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, pageWidth, 28, "F");
        doc.setFillColor(...COLORS.accent);
        doc.rect(0, 28, pageWidth, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(...COLORS.accent);
        doc.text(pageTitle, margin, 18);
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.mediumGray);
        doc.text(dateStr, pageWidth - margin, 18, { align: "right" });
        return 40;
    };

    // --- Footer helper ---
    const drawPageFooter = (pageNum: number, totalPages?: number) => {
        const footerY = pageHeight - 8;
        doc.setDrawColor(...COLORS.mediumGray);
        doc.setLineWidth(0.3);
        doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.darkGray);
        doc.text("Schneider — Internal Report", margin, footerY);
        doc.text(`Page ${pageNum}${totalPages ? ` of ${totalPages}` : ""}`, pageWidth - margin, footerY, { align: "right" });
        doc.text(genDate, pageWidth / 2, footerY, { align: "center" });
    };

    y = drawPageHeader("Executive Summary");

    // KPI Cards Row
    const kpiCards = [
        { label: "Total Orders", value: String(stats.total), bg: COLORS.kpiBlue, color: [30, 64, 175] as [number, number, number] },
        { label: "Revenue", value: formatIQD(stats.totalRevenue), bg: COLORS.kpiGreen, color: [22, 101, 52] as [number, number, number] },
        { label: "Delivery Rate", value: `${stats.deliveryRate.toFixed(1)}%`, bg: COLORS.kpiGreen, color: [22, 101, 52] as [number, number, number] },
        { label: "Rejection Rate", value: `${stats.rejectionRate.toFixed(1)}%`, bg: COLORS.kpiRed, color: [153, 27, 27] as [number, number, number] },
        { label: "Avg Order Value", value: formatIQD(stats.avgOrderValue), bg: COLORS.kpiPurple, color: [88, 28, 135] as [number, number, number] },
    ];

    const kpiCardWidth = (contentWidth - 8) / 5; // 4 gaps of 2mm
    const kpiCardHeight = 28;

    kpiCards.forEach((card, i) => {
        const x = margin + i * (kpiCardWidth + 2);

        // Card background
        doc.setFillColor(...card.bg);
        doc.roundedRect(x, y, kpiCardWidth, kpiCardHeight, 3, 3, "F");

        // Value
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...card.color);
        doc.text(card.value, x + kpiCardWidth / 2, y + 12, { align: "center" });

        // Label
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...COLORS.darkGray);
        doc.text(card.label, x + kpiCardWidth / 2, y + 20, { align: "center" });
    });

    y += kpiCardHeight + 12;

    // Status Breakdown Table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.text);
    doc.text("Status Breakdown", margin, y);
    y += 6;

    const statusRows = Object.entries(stats.byStatus)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => [
            getStatusLabel(status),
            String(count),
            `${((count / stats.total) * 100).toFixed(1)}%`,
        ]);

    autoTable(doc, {
        startY: y,
        head: [["Status", "Count", "Percentage"]],
        body: statusRows,
        theme: "grid",
        margin: { left: margin, right: margin },
        styles: {
            fontSize: 9,
            cellPadding: 4,
            lineColor: [230, 230, 230],
            lineWidth: 0.3,
        },
        headStyles: {
            fillColor: COLORS.primary,
            textColor: COLORS.accent,
            fontStyle: "bold",
            fontSize: 8,
        },
        alternateRowStyles: {
            fillColor: [250, 250, 250],
        },
        didParseCell(data) {
            if (data.section === "body" && data.column.index === 0) {
                const statusKey = Object.entries(STATUS_LABELS).find(
                    ([, label]) => label === data.cell.raw
                )?.[0];
                if (statusKey) {
                    const color = getStatusColor(statusKey);
                    data.cell.styles.textColor = color;
                    data.cell.styles.fontStyle = "bold";
                }
            }
        },
    });

    y = (doc as any).lastAutoTable.finalY + 12;

    // Payment Status Breakdown
    if (y < pageHeight - 80) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...COLORS.text);
        doc.text("Payment Status", margin, y);
        y += 6;

        const paymentLabels: Record<string, string> = {
            pending: "Pending",
            cod: "Cash on Delivery",
            prepaid: "Prepaid",
            partial: "Partial",
            paid: "Paid",
        };

        const paymentRows = Object.entries(stats.byPayment)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([status, data]) => [
                paymentLabels[status] || status,
                String(data.count),
                formatIQD(data.revenue),
            ]);

        autoTable(doc, {
            startY: y,
            head: [["Payment Type", "Orders", "Revenue"]],
            body: paymentRows,
            theme: "grid",
            margin: { left: margin, right: margin },
            styles: {
                fontSize: 9,
                cellPadding: 4,
                lineColor: [230, 230, 230],
                lineWidth: 0.3,
            },
            headStyles: {
                fillColor: COLORS.primary,
                textColor: COLORS.accent,
                fontStyle: "bold",
                fontSize: 8,
            },
            alternateRowStyles: {
                fillColor: [250, 250, 250],
            },
        });
    }

    drawPageFooter(2);

    // ============================================
    // PAGE 3: ORDER DETAILS TABLE (for order_list report type)
    // ============================================
    if (reportType === "order_list") {
        doc.addPage();
        const startPage = doc.getNumberOfPages();
        const tableY = drawPageHeader("Order Details");

        const orderRows = orders.map((order) => [
            order.order_id || order.id.slice(0, 8),
            order.customer_name,
            order.phone || "—",
            order.city || "—",
            order.items?.map((i) => `${i.name} x${i.quantity}`).join(", ") || "—",
            formatIQD(Number(order.price) || 0),
            getStatusLabel(order.status),
            new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ]);

        autoTable(doc, {
            startY: tableY,
            head: [["Order ID", "Customer", "Phone", "City", "Items", "Total", "Status", "Date"]],
            body: orderRows,
            theme: "grid",
            margin: { left: margin, right: margin },
            styles: {
                fontSize: 7.5,
                cellPadding: 3,
                lineColor: [230, 230, 230],
                lineWidth: 0.3,
                overflow: "ellipsize",
            },
            headStyles: {
                fillColor: COLORS.primary,
                textColor: COLORS.accent,
                fontStyle: "bold",
                fontSize: 7,
            },
            alternateRowStyles: {
                fillColor: [250, 250, 250],
            },
            columnStyles: {
                0: { cellWidth: 18 },   // Order ID
                1: { cellWidth: 28 },   // Customer
                2: { cellWidth: 22 },   // Phone
                3: { cellWidth: 20 },   // City
                4: { cellWidth: "auto" }, // Items
                5: { cellWidth: 22, halign: "right" },  // Total
                6: { cellWidth: 20 },   // Status
                7: { cellWidth: 18 },   // Date
            },
            didParseCell(data) {
                if (data.section === "body" && data.column.index === 6) {
                    const statusKey = Object.entries(STATUS_LABELS).find(
                        ([, label]) => label === data.cell.raw
                    )?.[0];
                    if (statusKey) {
                        const color = getStatusColor(statusKey);
                        data.cell.styles.textColor = color;
                        data.cell.styles.fontStyle = "bold";
                    }
                }
            },
            didDrawPage(data) {
                // Draw header on continuation pages
                if (data.pageNumber > 1) {
                    drawPageHeader("Order Details (continued)");
                }
                // Draw footer on each page
                drawPageFooter(startPage + data.pageNumber - 1);
            },
        });
    }

    // ============================================
    // CITY PERFORMANCE PAGE
    // ============================================
    if (stats.byCity.length > 0) {
        doc.addPage();
        const cityY = drawPageHeader("City Performance");
        const pageNum = doc.getNumberOfPages();

        const cityRows = stats.byCity.slice(0, 30).map((city) => {
            const shipped = city.delivered + city.rejected;
            return [
                city.city,
                String(city.total),
                String(city.delivered),
                String(city.rejected),
                shipped > 0 ? `${city.deliveryRate.toFixed(1)}%` : "—",
                formatIQD(city.revenue),
            ];
        });

        autoTable(doc, {
            startY: cityY,
            head: [["City", "Total", "Delivered", "Rejected", "Delivery Rate", "Revenue"]],
            body: cityRows,
            theme: "grid",
            margin: { left: margin, right: margin },
            styles: {
                fontSize: 8.5,
                cellPadding: 4,
                lineColor: [230, 230, 230],
                lineWidth: 0.3,
            },
            headStyles: {
                fillColor: COLORS.primary,
                textColor: COLORS.accent,
                fontStyle: "bold",
                fontSize: 8,
            },
            alternateRowStyles: {
                fillColor: [250, 250, 250],
            },
            columnStyles: {
                4: { halign: "center" },
                5: { halign: "right" },
            },
            didParseCell(data) {
                // Color delivery rate column
                if (data.section === "body" && data.column.index === 4) {
                    const val = parseFloat(String(data.cell.raw));
                    if (!isNaN(val)) {
                        if (val >= 85) data.cell.styles.textColor = [22, 101, 52]; // Green
                        else if (val >= 70) data.cell.styles.textColor = [146, 64, 14]; // Amber
                        else data.cell.styles.textColor = [153, 27, 27]; // Red
                        data.cell.styles.fontStyle = "bold";
                    }
                }
            },
        });

        // Summary row
        const finalY = (doc as any).lastAutoTable.finalY + 8;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...COLORS.text);
        doc.text(`Total Cities: ${stats.byCity.length}`, margin, finalY);
        doc.text(`Total Revenue: ${formatIQD(stats.totalRevenue)}`, pageWidth - margin, finalY, { align: "right" });

        drawPageFooter(pageNum);
    }

    // ============================================
    // SAVE PDF
    // ============================================
    const dateSuffix = new Date().toISOString().split("T")[0];
    const filename = `Schneider_Report_${dateSuffix}.pdf`;
    doc.save(filename);
}
