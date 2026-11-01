"use client";

import {
    KPIMetrics,
    StatusFlowMetrics,
    ContactAttemptMetrics,
    CityPerformanceMetrics,
    RejectionReasonMetrics,
    TimeAnalysisMetrics,
    AttentionFlagMetrics
} from "@/lib/analytics/reports-calculations";
import { downloadFile, generateExportFilename } from "@/lib/order-export-utils";

/**
 * Reports Export Utilities
 * 
 * Functions for exporting operational reports to CSV, Excel, and print formats.
 */

// =============================================
// TYPES
// =============================================

export interface ReportsExportData {
    dateRange: { from: Date; to: Date };
    kpis: KPIMetrics;
    statusFlow: StatusFlowMetrics[];
    contactAttempts: ContactAttemptMetrics[];
    cityPerformance: CityPerformanceMetrics[];
    rejectionReasons: RejectionReasonMetrics[];
    timeAnalysis: TimeAnalysisMetrics;
    attentionFlags: AttentionFlagMetrics[];
}

// =============================================
// ESCAPING
// =============================================

/** City names and rejection reasons are customer-supplied: escape them before they enter XML or print HTML. */
function escapeMarkup(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** One CSV cell: quotes doubled, and a leading = + - @ neutralised so a spreadsheet never runs it as a formula. */
export function csvCell(value: string): string {
    const guarded = /^([=+@\t\r]|-(?!\d))/.test(value) ? `'${value}` : value;
    return `"${guarded.replace(/"/g, '""')}"`;
}

// =============================================
// CSV EXPORT
// =============================================

export function exportReportsToCSV(data: ReportsExportData): { success: boolean } {
    const rows: string[][] = [];
    const dateFrom = data.dateRange.from.toLocaleDateString();
    const dateTo = data.dateRange.to.toLocaleDateString();

    // Header
    rows.push(["OPERATIONAL REPORTS"]);
    rows.push([`Period: ${dateFrom} to ${dateTo}`]);
    rows.push([]);

    // KPI Summary
    rows.push(["KPI SUMMARY"]);
    rows.push(["Metric", "Value", "Change"]);
    rows.push(["Total Orders", data.kpis.totalOrders.toString(), `${data.kpis.totalOrdersChange.toFixed(1)}%`]);
    rows.push(["Delivery Rate", `${data.kpis.deliveryRate.toFixed(1)}%`, `${data.kpis.deliveryRateChange.toFixed(1)}%`]);
    rows.push(["Contact Success", `${data.kpis.contactSuccessRate.toFixed(1)}%`, `${data.kpis.contactSuccessChange.toFixed(1)}%`]);
    rows.push(["Rejection Rate", `${data.kpis.rejectionRate.toFixed(1)}%`, `${data.kpis.rejectionRateChange.toFixed(1)}%`]);
    rows.push(["No Response Rate", `${data.kpis.noResponseRate.toFixed(1)}%`, `${data.kpis.noResponseChange.toFixed(1)}%`]);
    rows.push(["Avg Processing Time", `${data.kpis.avgProcessingTime.toFixed(1)}h`, `${data.kpis.avgProcessingTimeChange.toFixed(1)}%`]);
    rows.push([]);

    // Status Flow
    rows.push(["STATUS DISTRIBUTION"]);
    rows.push(["Status", "Count", "Percentage"]);
    data.statusFlow.forEach(s => {
        rows.push([s.label, s.count.toString(), `${s.percentage.toFixed(1)}%`]);
    });
    rows.push([]);

    // City Performance
    rows.push(["CITY PERFORMANCE"]);
    rows.push(["City", "Total Orders", "Delivered", "Rejected", "Delivery Rate", "Avg Days"]);
    data.cityPerformance.forEach(c => {
        rows.push([
            c.city,
            c.totalOrders.toString(),
            c.delivered.toString(),
            c.rejected.toString(),
            `${c.deliveryRate.toFixed(1)}%`,
            c.avgDeliveryDays > 0 ? c.avgDeliveryDays.toFixed(1) : "-"
        ]);
    });
    rows.push([]);

    // Contact Attempts
    rows.push(["CONTACT ATTEMPTS ANALYSIS"]);
    rows.push(["Attempts", "Count", "Confirmation Rate"]);
    data.contactAttempts.forEach(c => {
        rows.push([c.label, c.count.toString(), `${c.confirmationRate.toFixed(1)}%`]);
    });
    rows.push([]);

    // Rejection Reasons
    if (data.rejectionReasons.length > 0) {
        rows.push(["REJECTION REASONS"]);
        rows.push(["Reason", "Count", "Percentage", "Top City"]);
        data.rejectionReasons.forEach(r => {
            rows.push([r.reason, r.count.toString(), `${r.percentage.toFixed(1)}%`, r.topCity || "-"]);
        });
        rows.push([]);
    }

    // Attention Flags
    if (data.attentionFlags.length > 0) {
        rows.push(["ATTENTION FLAGS"]);
        rows.push(["Flag", "Count", "Severity"]);
        data.attentionFlags.forEach(f => {
            rows.push([f.label, f.count.toString(), f.severity]);
        });
    }

    // Convert to CSV
    const csvContent = rows.map(row => row.map(csvCell).join(",")).join("\n");

    // Download with BOM for Excel compatibility
    downloadFile(
        "\ufeff" + csvContent,
        generateExportFilename("operational_report", "csv"),
        "text/csv"
    );

    return { success: true };
}

// =============================================
// EXCEL EXPORT (XML Format)
// =============================================

export function exportReportsToExcel(data: ReportsExportData): { success: boolean } {
    const dateFrom = data.dateRange.from.toLocaleDateString();
    const dateTo = data.dateRange.to.toLocaleDateString();

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ';
    xml += 'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';

    // Styles
    xml += "<Styles>\n";
    xml += '<Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16"/><Interior ss:Color="#6366F1" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF"/></Style>\n';
    xml += '<Style ss:ID="Header"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/></Style>\n';
    xml += '<Style ss:ID="Number"><NumberFormat ss:Format="#,##0"/></Style>\n';
    xml += '<Style ss:ID="Percent"><NumberFormat ss:Format="0.0%"/></Style>\n';
    xml += '<Style ss:ID="Good"><Interior ss:Color="#D1FAE5" ss:Pattern="Solid"/></Style>\n';
    xml += '<Style ss:ID="Bad"><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/></Style>\n';
    xml += "</Styles>\n";

    // KPI Summary Sheet
    xml += '<Worksheet ss:Name="KPI Summary">\n<Table>\n';
    xml += `<Row><Cell ss:StyleID="Title"><Data ss:Type="String">Operational Report</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Period: ${dateFrom} to ${dateTo}</Data></Cell></Row>\n`;
    xml += "<Row></Row>\n";

    xml += '<Row><Cell ss:StyleID="Header"><Data ss:Type="String">Metric</Data></Cell>';
    xml += '<Cell ss:StyleID="Header"><Data ss:Type="String">Value</Data></Cell>';
    xml += '<Cell ss:StyleID="Header"><Data ss:Type="String">Change</Data></Cell></Row>\n';

    const kpiRows = [
        ["Total Orders", data.kpis.totalOrders, data.kpis.totalOrdersChange],
        ["Delivery Rate", `${data.kpis.deliveryRate.toFixed(1)}%`, data.kpis.deliveryRateChange],
        ["Contact Success", `${data.kpis.contactSuccessRate.toFixed(1)}%`, data.kpis.contactSuccessChange],
        ["Rejection Rate", `${data.kpis.rejectionRate.toFixed(1)}%`, data.kpis.rejectionRateChange],
        ["No Response Rate", `${data.kpis.noResponseRate.toFixed(1)}%`, data.kpis.noResponseChange],
        ["Avg Processing Time", `${data.kpis.avgProcessingTime.toFixed(1)}h`, data.kpis.avgProcessingTimeChange],
    ];

    kpiRows.forEach(([label, value, change]) => {
        const changeNum = typeof change === 'number' ? change : 0;
        xml += `<Row><Cell><Data ss:Type="String">${label}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${value}</Data></Cell>`;
        xml += `<Cell ss:StyleID="${changeNum >= 0 ? 'Good' : 'Bad'}"><Data ss:Type="String">${changeNum >= 0 ? '+' : ''}${changeNum.toFixed(1)}%</Data></Cell></Row>\n`;
    });

    xml += "</Table>\n</Worksheet>\n";

    // City Performance Sheet
    xml += '<Worksheet ss:Name="City Performance">\n<Table>\n';
    xml += '<Row><Cell ss:StyleID="Header"><Data ss:Type="String">City</Data></Cell>';
    xml += '<Cell ss:StyleID="Header"><Data ss:Type="String">Total Orders</Data></Cell>';
    xml += '<Cell ss:StyleID="Header"><Data ss:Type="String">Delivered</Data></Cell>';
    xml += '<Cell ss:StyleID="Header"><Data ss:Type="String">Rejected</Data></Cell>';
    xml += '<Cell ss:StyleID="Header"><Data ss:Type="String">Delivery Rate</Data></Cell>';
    xml += '<Cell ss:StyleID="Header"><Data ss:Type="String">Avg Days</Data></Cell></Row>\n';

    data.cityPerformance.forEach(city => {
        xml += `<Row>`;
        xml += `<Cell><Data ss:Type="String">${escapeMarkup(city.city)}</Data></Cell>`;
        xml += `<Cell ss:StyleID="Number"><Data ss:Type="Number">${city.totalOrders}</Data></Cell>`;
        xml += `<Cell ss:StyleID="Number"><Data ss:Type="Number">${city.delivered}</Data></Cell>`;
        xml += `<Cell ss:StyleID="Number"><Data ss:Type="Number">${city.rejected}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${city.deliveryRate.toFixed(1)}%</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${city.avgDeliveryDays > 0 ? city.avgDeliveryDays.toFixed(1) : '-'}</Data></Cell>`;
        xml += `</Row>\n`;
    });

    xml += "</Table>\n</Worksheet>\n";

    // Status Flow Sheet
    xml += '<Worksheet ss:Name="Status Flow">\n<Table>\n';
    xml += '<Row><Cell ss:StyleID="Header"><Data ss:Type="String">Status</Data></Cell>';
    xml += '<Cell ss:StyleID="Header"><Data ss:Type="String">Count</Data></Cell>';
    xml += '<Cell ss:StyleID="Header"><Data ss:Type="String">Percentage</Data></Cell></Row>\n';

    data.statusFlow.forEach(status => {
        xml += `<Row>`;
        xml += `<Cell><Data ss:Type="String">${status.label}</Data></Cell>`;
        xml += `<Cell ss:StyleID="Number"><Data ss:Type="Number">${status.count}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${status.percentage.toFixed(1)}%</Data></Cell>`;
        xml += `</Row>\n`;
    });

    xml += "</Table>\n</Worksheet>\n";
    xml += "</Workbook>";

    // Download
    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = generateExportFilename("operational_report", "xls");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true };
}

// =============================================
// PRINT REPORT
// =============================================

export function printOperationalReport(data: ReportsExportData) {
    const dateFrom = data.dateRange.from.toLocaleDateString();
    const dateTo = data.dateRange.to.toLocaleDateString();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Operational Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a1a; max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #6366F1; }
        .header h1 { font-size: 28px; color: #6366F1; margin-bottom: 8px; }
        .header p { color: #6b7280; font-size: 14px; }
        .section { margin-bottom: 35px; page-break-inside: avoid; }
        .section h2 { font-size: 16px; color: #374151; margin-bottom: 15px; padding: 10px 15px; background: linear-gradient(90deg, #6366F1 0%, transparent 100%); color: white; border-radius: 8px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 20px; }
        .kpi-card { padding: 18px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-radius: 12px; text-align: center; border: 1px solid #bae6fd; }
        .kpi-card .value { font-size: 24px; font-weight: 700; color: #0369a1; }
        .kpi-card .label { font-size: 11px; color: #6b7280; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .kpi-card .change { font-size: 11px; margin-top: 6px; padding: 2px 8px; border-radius: 12px; display: inline-block; }
        .kpi-card .change.positive { background: #d1fae5; color: #059669; }
        .kpi-card .change.negative { background: #fee2e2; color: #dc2626; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
        th { background: #f9fafb; font-weight: 600; color: #374151; }
        td { color: #4b5563; }
        tr:hover { background: #f9fafb; }
        .rate-good { color: #059669; font-weight: 600; }
        .rate-warn { color: #d97706; font-weight: 600; }
        .rate-bad { color: #dc2626; font-weight: 600; }
        .podium { display: flex; gap: 15px; margin-bottom: 20px; }
        .podium-card { flex: 1; padding: 15px; border-radius: 12px; text-align: center; color: white; }
        .podium-card.gold { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); }
        .podium-card.silver { background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%); }
        .podium-card.bronze { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); }
        .podium-card .rank { font-size: 11px; opacity: 0.9; }
        .podium-card .city { font-size: 16px; font-weight: 700; margin: 5px 0; }
        .podium-card .orders { font-size: 24px; font-weight: 700; }
        .flag-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
        .flag-card { padding: 12px; border-radius: 10px; text-align: center; }
        .flag-card.high { background: #fee2e2; border: 1px solid #fecaca; }
        .flag-card.medium { background: #fef3c7; border: 1px solid #fde68a; }
        .flag-card.low { background: #dbeafe; border: 1px solid #bfdbfe; }
        .flag-card .count { font-size: 18px; font-weight: 700; margin: 5px 0; }
        .flag-card .label { font-size: 10px; color: #6b7280; }
        @media print { 
            body { padding: 20px; } 
            .section { page-break-inside: avoid; }
            .kpi-grid { grid-template-columns: repeat(3, 1fr); }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Operational Report</h1>
        <p>${dateFrom} — ${dateTo}</p>
    </div>

    <div class="section">
        <h2>Key Performance Indicators</h2>
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="value">${data.kpis.totalOrders.toLocaleString()}</div>
                <div class="label">Total Orders</div>
                <div class="change ${data.kpis.totalOrdersChange >= 0 ? 'positive' : 'negative'}">${data.kpis.totalOrdersChange >= 0 ? '+' : ''}${data.kpis.totalOrdersChange.toFixed(1)}%</div>
            </div>
            <div class="kpi-card">
                <div class="value">${data.kpis.deliveryRate.toFixed(1)}%</div>
                <div class="label">Delivery Rate</div>
                <div class="change ${data.kpis.deliveryRateChange >= 0 ? 'positive' : 'negative'}">${data.kpis.deliveryRateChange >= 0 ? '+' : ''}${data.kpis.deliveryRateChange.toFixed(1)}%</div>
            </div>
            <div class="kpi-card">
                <div class="value">${data.kpis.contactSuccessRate.toFixed(1)}%</div>
                <div class="label">Contact Success</div>
                <div class="change ${data.kpis.contactSuccessChange >= 0 ? 'positive' : 'negative'}">${data.kpis.contactSuccessChange >= 0 ? '+' : ''}${data.kpis.contactSuccessChange.toFixed(1)}%</div>
            </div>
            <div class="kpi-card">
                <div class="value">${data.kpis.rejectionRate.toFixed(1)}%</div>
                <div class="label">Rejection Rate</div>
                <div class="change ${data.kpis.rejectionRateChange <= 0 ? 'positive' : 'negative'}">${data.kpis.rejectionRateChange >= 0 ? '+' : ''}${data.kpis.rejectionRateChange.toFixed(1)}%</div>
            </div>
            <div class="kpi-card">
                <div class="value">${data.kpis.noResponseRate.toFixed(1)}%</div>
                <div class="label">No Response</div>
                <div class="change ${data.kpis.noResponseChange <= 0 ? 'positive' : 'negative'}">${data.kpis.noResponseChange >= 0 ? '+' : ''}${data.kpis.noResponseChange.toFixed(1)}%</div>
            </div>
            <div class="kpi-card">
                <div class="value">${data.kpis.avgProcessingTime.toFixed(0)}h</div>
                <div class="label">Avg Processing</div>
                <div class="change ${data.kpis.avgProcessingTimeChange <= 0 ? 'positive' : 'negative'}">${data.kpis.avgProcessingTimeChange >= 0 ? '+' : ''}${data.kpis.avgProcessingTimeChange.toFixed(1)}%</div>
            </div>
        </div>
    </div>

    ${data.attentionFlags.length > 0 ? `
    <div class="section">
        <h2>⚠️ Attention Required</h2>
        <div class="flag-grid">
            ${data.attentionFlags.map(flag => `
                <div class="flag-card ${flag.severity}">
                    <div class="count">${flag.count}</div>
                    <div class="label">${flag.label}</div>
                </div>
            `).join('')}
        </div>
    </div>
    ` : ''}

    <div class="section">
        <h2>🏆 Top Cities</h2>
        <div class="podium">
            ${data.cityPerformance.slice(0, 3).map((city, i) => `
                <div class="podium-card ${i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze'}">
                    <div class="rank">#${i + 1}</div>
                    <div class="city">${escapeMarkup(city.city)}</div>
                    <div class="orders">${city.totalOrders}</div>
                    <div class="rank">${city.deliveryRate.toFixed(0)}% delivered</div>
                </div>
            `).join('')}
        </div>
        <table>
            <thead>
                <tr>
                    <th>City</th>
                    <th>Orders</th>
                    <th>Delivered</th>
                    <th>Rejected</th>
                    <th>Rate</th>
                    <th>Avg Days</th>
                </tr>
            </thead>
            <tbody>
                ${data.cityPerformance.slice(0, 10).map(city => `
                    <tr>
                        <td><strong>${escapeMarkup(city.city)}</strong></td>
                        <td>${city.totalOrders}</td>
                        <td>${city.delivered}</td>
                        <td>${city.rejected}</td>
                        <td class="${city.deliveryRate >= 85 ? 'rate-good' : city.deliveryRate >= 70 ? 'rate-warn' : 'rate-bad'}">${city.deliveryRate.toFixed(1)}%</td>
                        <td>${city.avgDeliveryDays > 0 ? city.avgDeliveryDays.toFixed(1) + 'd' : '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>📊 Status Distribution</h2>
        <table>
            <thead>
                <tr>
                    <th>Status</th>
                    <th>Count</th>
                    <th>Percentage</th>
                </tr>
            </thead>
            <tbody>
                ${data.statusFlow.map(status => `
                    <tr>
                        <td><strong>${status.label}</strong></td>
                        <td>${status.count.toLocaleString()}</td>
                        <td>${status.percentage.toFixed(1)}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    ${data.rejectionReasons.length > 0 ? `
    <div class="section">
        <h2>❌ Rejection Analysis</h2>
        <table>
            <thead>
                <tr>
                    <th>Reason</th>
                    <th>Count</th>
                    <th>Percentage</th>
                    <th>Top City</th>
                </tr>
            </thead>
            <tbody>
                ${data.rejectionReasons.map(r => `
                    <tr>
                        <td><strong>${escapeMarkup(r.reason)}</strong></td>
                        <td>${r.count}</td>
                        <td>${r.percentage.toFixed(1)}%</td>
                        <td>${escapeMarkup(r.topCity || '-')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    ` : ''}

</body>
</html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 300);
    }
}
