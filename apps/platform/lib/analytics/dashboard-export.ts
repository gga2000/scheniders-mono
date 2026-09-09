import type { DashboardMetrics } from "@/hooks/use-dashboard-metrics";

/**
 * COM-D1 — a merchant could read these numbers but never get them out: no export
 * anywhere on the dashboard. This builds the visible summary as CSV.
 *
 * Two rules it exists to enforce:
 *
 * 1. ENTITLEMENT. Money is omitted entirely for viewers without VIEW_FINANCIALS
 *    rather than exported as blanks. The RPC already nulls those fields (SEC-D2);
 *    exporting empty "Revenue" columns would imply the merchant earned nothing,
 *    which is the same class of lie as the 0% delivery rate (COR-D7).
 *
 * 2. FORMULA INJECTION. City and product names come from order records, i.e. from
 *    the outside. A value starting with = + - @ (or tab/CR) is executed as a
 *    formula when the file is opened in Excel or Sheets, which is a well-known way
 *    to turn an innocuous export into code execution on the merchant's machine.
 *    Every field is escaped.
 */

const RISKY_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvField(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "";
    let s = String(value);
    // Neutralise the formula without altering what the reader sees.
    if (RISKY_PREFIX.test(s)) s = `'${s}`;
    if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
    return rows.map(r => r.map(escapeCsvField).join(",")).join("\r\n");
}

export interface DashboardExportOptions {
    /** Range key the page is showing, recorded so the file is self-describing. */
    range: string;
    /** False when the viewer lacks VIEW_FINANCIALS — money is then omitted. */
    includeFinancials: boolean;
    generatedAt?: Date;
}

export function buildDashboardCsv(
    metrics: DashboardMetrics,
    { range, includeFinancials, generatedAt = new Date() }: DashboardExportOptions,
): string {
    const rows: (string | number | null | undefined)[][] = [];
    const money = (n: number | null | undefined) => (includeFinancials ? n ?? "" : "");

    rows.push(["Scheniders — dashboard summary"]);
    rows.push(["Generated", generatedAt.toISOString()]);
    rows.push(["Range", range]);
    if (!includeFinancials) rows.push(["Note", "Financial figures omitted — this account cannot view them"]);
    rows.push([]);

    rows.push(["Today"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Orders today", metrics.todayStrip.ordersToday]);
    rows.push(["Orders yesterday", metrics.todayStrip.ordersYesterday]);
    if (includeFinancials) {
        rows.push(["Revenue today (collected)", money(metrics.todayStrip.revenueToday)]);
        rows.push(["Revenue yesterday (collected)", money(metrics.todayStrip.revenueYesterday)]);
    }
    rows.push([]);

    rows.push(["Pipeline"]);
    rows.push(["Stage", "Orders"]);
    metrics.pipeline.forEach(s => rows.push([s.label, s.count]));
    rows.push([]);

    rows.push(["Delivery"]);
    rows.push(["Metric", "Value"]);
    rows.push([
        "Delivery rate (last 7 days)",
        metrics.deliveryRate.currentRate === null ? "no data" : `${metrics.deliveryRate.currentRate}%`,
    ]);
    metrics.avgTimePerStage.forEach(m =>
        rows.push([m.label, `${m.avgHours.toFixed(1)}h`, `n=${m.sampleSize}`]));
    rows.push([]);

    rows.push(["Top cities"]);
    rows.push(["City", "Orders"]);
    metrics.enhancedLeaderboard.topCities.forEach(c => rows.push([c.label, c.value]));
    rows.push([]);

    rows.push(["Top products"]);
    rows.push(includeFinancials ? ["Product", "Units", "Revenue"] : ["Product", "Units"]);
    metrics.enhancedLeaderboard.topProductsEnhanced.forEach(p =>
        rows.push(includeFinancials
            ? [p.label, p.value, money(p.revenue)]
            : [p.label, p.value]));
    rows.push([]);

    rows.push(["Rejections by city"]);
    rows.push(["City", "Rejected", "Total", "Rate %"]);
    Object.entries(metrics.urgency.cityRejectionStats)
        .filter(([, s]) => s.total >= 5 && s.rejected > 0)
        .sort((a, b) => b[1].rate - a[1].rate)
        .forEach(([city, s]) => rows.push([city, s.rejected, s.total, s.rate]));

    return toCsv(rows);
}
