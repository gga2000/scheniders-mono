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
    /** The page's translator, so exports speak the language the report was read in. */
    t: (key: string, fallbackOrVars?: string | Record<string, string | number>) => string;
    /** Arabic print layout is right-to-left; the app itself stays LTR. */
    rtl: boolean;
}

/** A report date as DD/MM/YYYY on the Baghdad calendar, the same on every device. */
export function formatReportDate(date: Date): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Baghdad",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
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

const CSS = `
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
    `;

// =============================================
// SHARED LABELS
// =============================================

type Translate = ReportsExportData["t"];

interface KpiLine {
    label: string;
    value: string;
    change: number;
    /** "pp" for rates (percentage points), "%" for counts and times. */
    unit: "pp" | "%";
    higherIsBetter: boolean;
}

function kpiLines(data: ReportsExportData): KpiLine[] {
    const { t, kpis: k } = data;
    const pct = (n: number) => `${n.toFixed(1)}%`;
    return [
        { label: t("reports.kpi.total"), value: k.totalOrders.toLocaleString("en-US"), change: k.totalOrdersChange, unit: "%", higherIsBetter: true },
        { label: t("reports.kpi.delivery"), value: pct(k.deliveryRate), change: k.deliveryRateChange, unit: "pp", higherIsBetter: true },
        { label: t("reports.kpi.contact"), value: pct(k.contactSuccessRate), change: k.contactSuccessChange, unit: "pp", higherIsBetter: true },
        { label: t("reports.kpi.rejection"), value: pct(k.rejectionRate), change: k.rejectionRateChange, unit: "pp", higherIsBetter: false },
        { label: t("reports.kpi.noResponse"), value: pct(k.noResponseRate), change: k.noResponseChange, unit: "pp", higherIsBetter: false },
        { label: t("reports.kpi.processing"), value: t("reports.unit.hours", { n: k.avgProcessingTime.toFixed(0) }), change: k.avgProcessingTimeChange, unit: "%", higherIsBetter: false },
    ];
}

/** "+2.1 pp" for a rate, "+4.0%" for a count; empty when nothing moved (or there was no previous period). */
function formatChange(line: KpiLine, t: Translate): string {
    if (Math.abs(line.change) < 0.05) return "";
    const sign = line.change > 0 ? "+" : "";
    const n = line.change.toFixed(1);
    return line.unit === "pp" ? `${sign}${n} ${t("reports.kpi.pp")}` : `${sign}${n}%`;
}

function isGoodChange(line: KpiLine): boolean {
    return line.higherIsBetter ? line.change > 0 : line.change < 0;
}

const statusName = (t: Translate, s: StatusFlowMetrics) => t(`reports.status.${s.status}`, s.label);
const flagName = (t: Translate, f: AttentionFlagMetrics) => t(`reports.attention.flag.${f.flagType}`, f.label);
const bucketName = (t: Translate, c: ContactAttemptMetrics) => t(`reports.contact.bucket.${c.attempts}`, c.label);

function periodLine(data: ReportsExportData): string {
    return data.t("reports.export.period", {
        from: formatReportDate(data.dateRange.from),
        to: formatReportDate(data.dateRange.to),
    });
}

// =============================================
// CSV EXPORT
// =============================================

export function exportReportsToCSV(data: ReportsExportData): { success: boolean } {
    const { t } = data;
    const rows: string[][] = [];

    rows.push([t("reports.export.title")]);
    rows.push([periodLine(data)]);
    rows.push([]);

    rows.push([t("reports.export.kpiHeading")]);
    rows.push([t("reports.export.metric"), t("reports.export.value"), t("reports.export.change")]);
    // A leading + or - would be run as a formula by a spreadsheet, so the CSV marks direction with an arrow.
    kpiLines(data).forEach(line => rows.push([
        line.label,
        line.value,
        formatChange(line, t).replace(/^\+/, "▲ ").replace(/^-/, "▼ "),
    ]));
    rows.push([]);

    rows.push([t("reports.export.statusHeading")]);
    rows.push([t("reports.export.status"), t("reports.common.count"), t("reports.export.percentage")]);
    data.statusFlow.forEach(s => {
        rows.push([statusName(t, s), s.count.toString(), `${s.percentage.toFixed(1)}%`]);
    });
    rows.push([]);

    rows.push([t("reports.city.title")]);
    rows.push([
        t("reports.city.col.city"), t("reports.common.ordersCap"), t("reports.common.delivered"),
        t("reports.common.rejected"), t("reports.city.col.rate"), t("reports.city.col.days"),
    ]);
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

    rows.push([t("reports.export.contactHeading")]);
    rows.push([t("reports.export.attempts"), t("reports.common.count"), t("reports.export.confirmationRate")]);
    data.contactAttempts.forEach(c => {
        rows.push([bucketName(t, c), c.count.toString(), `${c.confirmationRate.toFixed(1)}%`]);
    });
    rows.push([]);

    if (data.rejectionReasons.length > 0) {
        rows.push([t("reports.rejection.title")]);
        rows.push([t("reports.export.reason"), t("reports.common.count"), t("reports.export.percentage"), t("reports.common.topCity")]);
        data.rejectionReasons.forEach(r => {
            rows.push([r.reason, r.count.toString(), `${r.percentage.toFixed(1)}%`, r.topCity || "-"]);
        });
        rows.push([]);
    }

    if (data.attentionFlags.length > 0) {
        rows.push([t("reports.attention.title")]);
        rows.push([t("reports.export.flag"), t("reports.common.count"), t("reports.export.severity")]);
        data.attentionFlags.forEach(f => {
            rows.push([flagName(t, f), f.count.toString(), t(`reports.attention.severity.${f.severity}`)]);
        });
    }

    const csvContent = rows.map(row => row.map(csvCell).join(",")).join("\n");

    // Download with BOM for Excel compatibility
    downloadFile(
        "﻿" + csvContent,
        generateExportFilename("operational_report", "csv"),
        "text/csv"
    );

    return { success: true };
}

// =============================================
// EXCEL EXPORT (XML Format)
// =============================================

/** An Excel sheet name: 31 characters at most, none of : \ / ? * [ ]. */
function sheetName(value: string): string {
    return escapeMarkup(value.replace(/[:\\/?*[\]]/g, " ").slice(0, 31));
}

function headerRow(cells: string[]): string {
    return `<Row>${cells.map(c => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeMarkup(c)}</Data></Cell>`).join("")}</Row>\n`;
}

export function exportReportsToExcel(data: ReportsExportData): { success: boolean } {
    const { t } = data;

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
    xml += `<Worksheet ss:Name="${sheetName(t("reports.export.kpiSheet"))}">\n<Table>\n`;
    xml += `<Row><Cell ss:StyleID="Title"><Data ss:Type="String">${escapeMarkup(t("reports.export.title"))}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">${escapeMarkup(periodLine(data))}</Data></Cell></Row>\n`;
    xml += "<Row></Row>\n";
    xml += headerRow([t("reports.export.metric"), t("reports.export.value"), t("reports.export.change")]);

    kpiLines(data).forEach(line => {
        const change = formatChange(line, t);
        const style = change === "" ? "" : ` ss:StyleID="${isGoodChange(line) ? "Good" : "Bad"}"`;
        xml += `<Row><Cell><Data ss:Type="String">${escapeMarkup(line.label)}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${escapeMarkup(line.value)}</Data></Cell>`;
        xml += `<Cell${style}><Data ss:Type="String">${escapeMarkup(change)}</Data></Cell></Row>\n`;
    });
    xml += "</Table>\n</Worksheet>\n";

    // City Performance Sheet
    xml += `<Worksheet ss:Name="${sheetName(t("reports.city.title"))}">\n<Table>\n`;
    xml += headerRow([
        t("reports.city.col.city"), t("reports.common.ordersCap"), t("reports.common.delivered"),
        t("reports.common.rejected"), t("reports.city.col.rate"), t("reports.city.col.days"),
    ]);
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

    // Status Sheet
    xml += `<Worksheet ss:Name="${sheetName(t("reports.export.statusHeading"))}">\n<Table>\n`;
    xml += headerRow([t("reports.export.status"), t("reports.common.count"), t("reports.export.percentage")]);
    data.statusFlow.forEach(status => {
        xml += `<Row>`;
        xml += `<Cell><Data ss:Type="String">${escapeMarkup(statusName(t, status))}</Data></Cell>`;
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

function thRow(cells: string[]): string {
    return `<tr>${cells.map(c => `<th>${escapeMarkup(c)}</th>`).join("")}</tr>`;
}

export function printOperationalReport(data: ReportsExportData) {
    const { t } = data;
    // Print-only HTML is allowed to be RTL for Arabic (the app UI never is).
    const dir = data.rtl ? "rtl" : "ltr";
    const lang = data.rtl ? "ar" : "en";
    const title = escapeMarkup(t("reports.export.title"));

    const kpiCards = kpiLines(data).map(line => {
        const change = formatChange(line, t);
        return `
            <div class="kpi-card">
                <div class="value">${escapeMarkup(line.value)}</div>
                <div class="label">${escapeMarkup(line.label)}</div>
                ${change ? `<div class="change ${isGoodChange(line) ? "positive" : "negative"}">${escapeMarkup(change)}</div>` : ""}
            </div>`;
    }).join("");

    const html = `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>__CSS__
        th, td { text-align: start; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${title}</h1>
        <p>${escapeMarkup(periodLine(data))}</p>
    </div>

    <div class="section">
        <h2>${escapeMarkup(t("reports.export.kpiHeading"))}</h2>
        <div class="kpi-grid">${kpiCards}
        </div>
    </div>

    ${data.attentionFlags.length > 0 ? `
    <div class="section">
        <h2>${escapeMarkup(t("reports.attention.title"))}</h2>
        <div class="flag-grid">
            ${data.attentionFlags.map(flag => `
                <div class="flag-card ${flag.severity}">
                    <div class="count">${flag.count}</div>
                    <div class="label">${escapeMarkup(flagName(t, flag))}</div>
                </div>
            `).join('')}
        </div>
    </div>
    ` : ''}

    <div class="section">
        <h2>${escapeMarkup(t("reports.export.topCities"))}</h2>
        <div class="podium">
            ${data.cityPerformance.slice(0, 3).map((city, i) => `
                <div class="podium-card ${i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze'}">
                    <div class="rank">#${i + 1}</div>
                    <div class="city">${escapeMarkup(city.city)}</div>
                    <div class="orders">${city.totalOrders}</div>
                    <div class="rank">${escapeMarkup(t("reports.city.deliveredPct", { pct: city.deliveryRate.toFixed(0) }))}</div>
                </div>
            `).join('')}
        </div>
        <table>
            <thead>
                ${thRow([
                    t("reports.city.col.city"), t("reports.common.ordersCap"), t("reports.common.delivered"),
                    t("reports.common.rejected"), t("reports.city.col.rate"), t("reports.city.col.days"),
                ])}
            </thead>
            <tbody>
                ${data.cityPerformance.slice(0, 10).map(city => `
                    <tr>
                        <td><strong>${escapeMarkup(city.city)}</strong></td>
                        <td>${city.totalOrders}</td>
                        <td>${city.delivered}</td>
                        <td>${city.rejected}</td>
                        <td class="${city.deliveryRate >= 85 ? 'rate-good' : city.deliveryRate >= 70 ? 'rate-warn' : 'rate-bad'}">${city.deliveryRate.toFixed(1)}%</td>
                        <td>${city.avgDeliveryDays > 0 ? escapeMarkup(t("reports.unit.days", { n: city.avgDeliveryDays.toFixed(1) })) : '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>${escapeMarkup(t("reports.export.statusHeading"))}</h2>
        <table>
            <thead>
                ${thRow([t("reports.export.status"), t("reports.common.count"), t("reports.export.percentage")])}
            </thead>
            <tbody>
                ${data.statusFlow.map(status => `
                    <tr>
                        <td><strong>${escapeMarkup(statusName(t, status))}</strong></td>
                        <td>${status.count.toLocaleString("en-US")}</td>
                        <td>${status.percentage.toFixed(1)}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    ${data.rejectionReasons.length > 0 ? `
    <div class="section">
        <h2>${escapeMarkup(t("reports.rejection.title"))}</h2>
        <table>
            <thead>
                ${thRow([t("reports.export.reason"), t("reports.common.count"), t("reports.export.percentage"), t("reports.common.topCity")])}
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
    `.replace("__CSS__", () => CSS);

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
