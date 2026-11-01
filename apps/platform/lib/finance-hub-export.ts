import { formatIQD } from "@/lib/utils";
import { baghdadDayKey } from "@/lib/order-window";
import type { FinanceOverviewResult } from "@/hooks/use-finance-overview";
import type { FinanceRevenueResult } from "@/hooks/use-finance-revenue";
import type { CashPositionResult } from "@/hooks/use-cash-position";

export interface FinanceExportContext {
    overview: FinanceOverviewResult;
    revenue: FinanceRevenueResult;
    cash: CashPositionResult;
    period: { start: Date; end: Date };
}

/** The period's Baghdad days. The UTC day would label a period that starts at Baghdad midnight with the day before. */
function ymd(d: Date): string {
    return baghdadDayKey(d);
}

function csvEscape(cell: string | number): string {
    return `"${String(cell ?? "").replace(/"/g, '""')}"`;
}

/**
 * A name from the store's data, safe to put in a CSV cell. A cell that starts
 * with = + - or @ would run as a formula when the file is opened in a
 * spreadsheet, and product, channel and city names are typed by merchants and
 * customers, so those are written as plain text.
 */
function plainText(value: string): string {
    return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeHtml(value: string | number): string {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function buildFinanceHubCsv(ctx: FinanceExportContext, generatedAt: string): string {
    const { overview, revenue, cash, period } = ctx;
    const rows: (string | number)[][] = [];

    rows.push(["Finances Report"]);
    rows.push([`Period: ${ymd(period.start)} to ${ymd(period.end)}`]);
    rows.push([`Generated: ${generatedAt}`]);
    rows.push([]);

    rows.push(["KPI SUMMARY"]);
    rows.push(["Metric", "Value (IQD)"]);
    rows.push(["Gross Revenue", overview.gross_revenue]);
    rows.push(["Net Revenue", overview.net_revenue]);
    rows.push(["Delivered Revenue", overview.delivered_revenue]);
    rows.push(["Refund Value", overview.refund_value]);
    rows.push(["COGS", overview.product_cost]);
    rows.push(["Delivery Cost", overview.delivery_cost]);
    rows.push(["Expenses", overview.expenses]);
    rows.push(["Marketing Cost", overview.marketing_cost]);
    rows.push(["Gross Profit", overview.gross_profit]);
    rows.push(["Net Profit", overview.net_profit]);
    rows.push(["Net Margin %", `${overview.margin_pct.toFixed(2)}%`]);
    rows.push(["Orders Count", overview.orders_count]);
    rows.push(["Delivered Count", overview.delivered_count]);
    rows.push(["Avg Order Value", overview.aov]);
    rows.push(["Delivery Rate %", `${overview.delivery_rate.toFixed(2)}%`]);
    rows.push([]);

    rows.push(["P&L WATERFALL"]);
    rows.push(["Step", "Value (IQD)"]);
    rows.push(["Gross Revenue", overview.gross_revenue]);
    rows.push(["- In transit / unconfirmed", -Math.max(0, overview.gross_revenue - overview.delivered_revenue)]);
    rows.push(["Delivered Revenue", overview.delivered_revenue]);
    rows.push(["- COGS", -overview.product_cost]);
    rows.push(["Gross Profit", overview.gross_profit]);
    rows.push(["- Refunds / Returns", -overview.refund_value]);
    rows.push(["- Expenses", -overview.expenses]);
    rows.push(["Net Profit", overview.net_profit]);
    rows.push([]);

    rows.push(["CASH POSITION"]);
    rows.push(["Bucket", "Value (IQD)"]);
    rows.push(["Collected", cash.cashCollected]);
    rows.push(["In Transit", cash.cashInTransit]);
    rows.push(["Confirmed", cash.cashConfirmed]);
    rows.push(["At Risk", cash.cashAtRisk]);
    rows.push(["Net Projection", cash.netProjection]);
    rows.push(["Historical Delivery Rate %", `${cash.historicalDeliveryRate.toFixed(2)}%`]);
    rows.push([]);

    if (overview.by_channel.length > 0) {
        rows.push(["BY CHANNEL"]);
        rows.push(["Channel", "Revenue (IQD)", "Orders", "Profit (IQD)"]);
        for (const c of overview.by_channel) {
            rows.push([plainText(c.label), c.revenue, c.orders, c.profit]);
        }
        rows.push([]);
    }

    if (overview.by_city.length > 0) {
        rows.push(["BY CITY"]);
        rows.push(["City", "Revenue (IQD)", "Orders", "Delivered", "Profit (IQD)"]);
        for (const c of overview.by_city) {
            rows.push([plainText(c.label), c.revenue, c.orders, c.delivered, c.profit]);
        }
        rows.push([]);
    }

    if (overview.by_product.length > 0) {
        rows.push(["BY PRODUCT"]);
        rows.push(["Product", "Revenue (IQD)", "Units", "Profit (IQD)", "Margin %"]);
        for (const p of overview.by_product) {
            rows.push([plainText(p.label), p.revenue, p.units, p.profit, `${p.margin.toFixed(2)}%`]);
        }
        rows.push([]);
    }

    if (overview.by_payment.length > 0) {
        rows.push(["BY PAYMENT"]);
        rows.push(["Method", "Revenue (IQD)", "Orders"]);
        for (const p of overview.by_payment) {
            rows.push([plainText(p.label), p.revenue, p.orders]);
        }
        rows.push([]);
    }

    if (revenue.refunds.top_refunded && revenue.refunds.top_refunded.length > 0) {
        rows.push(["TOP REFUNDED PRODUCTS"]);
        rows.push(["Product", "Refund Value (IQD)", "Units Returned"]);
        for (const p of revenue.refunds.top_refunded) {
            rows.push([plainText(p.name), p.value, p.count]);
        }
        rows.push([]);
    }

    if (overview.series.length > 0) {
        rows.push(["DAILY TIME SERIES"]);
        rows.push(["Bucket", "Revenue (IQD)", "Delivered Revenue", "Orders", "Delivered", "Product Cost", "Delivery Cost", "Expenses", "Profit"]);
        for (const s of overview.series) {
            rows.push([s.bucket, s.revenue, s.delivered_revenue, s.orders, s.delivered, s.product_cost, s.delivery_cost, s.expenses, s.profit]);
        }
    }

    return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function exportFinanceHubToCSV(ctx: FinanceExportContext): void {
    const { period } = ctx;
    const csv = buildFinanceHubCsv(ctx, new Date().toISOString());
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finances_${ymd(period.start)}_to_${ymd(period.end)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function buildFinanceHubPrintHtml(ctx: FinanceExportContext, generatedAt: string): string {
    const { overview, cash, period } = ctx;
    const tone = (n: number) => (n >= 0 ? "positive" : "negative");
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Finances — ${ymd(period.start)} to ${ymd(period.end)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 32px; color: #111; }
h1 { font-size: 22px; margin-bottom: 4px; }
.sub { color: #666; font-size: 12px; margin-bottom: 24px; }
section { margin-bottom: 28px; }
section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
.kpis { display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.kpi { padding: 12px; border: 1px solid #e5e5e5; border-radius: 8px; }
.kpi .label { font-size: 11px; color: #666; text-transform: uppercase; }
.kpi .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
.positive { color: #059669; }
.negative { color: #dc2626; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 6px 10px; border-bottom: 1px solid #eee; text-align: left; }
th { background: #fafafa; font-weight: 600; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
@media print { body { padding: 16px; } section { page-break-inside: avoid; } }
</style></head><body>
<h1>Finances Report</h1>
<div class="sub">${ymd(period.start)} to ${ymd(period.end)} · Generated ${escapeHtml(generatedAt)}</div>

<section><h2>KPI Summary</h2>
<div class="kpis">
    <div class="kpi"><div class="label">Gross Revenue</div><div class="value">${formatIQD(overview.gross_revenue)}</div></div>
    <div class="kpi"><div class="label">Net Profit</div><div class="value ${tone(overview.net_profit)}">${formatIQD(overview.net_profit)}</div></div>
    <div class="kpi"><div class="label">Net Margin</div><div class="value">${overview.margin_pct.toFixed(1)}%</div></div>
    <div class="kpi"><div class="label">Orders</div><div class="value">${overview.orders_count}</div></div>
    <div class="kpi"><div class="label">Avg Order Value</div><div class="value">${formatIQD(overview.aov)}</div></div>
    <div class="kpi"><div class="label">Delivery Rate</div><div class="value">${overview.delivery_rate.toFixed(1)}%</div></div>
</div></section>

<section><h2>Profit & Loss</h2>
<table>
<tr><td>Gross Revenue</td><td class="num">${formatIQD(overview.gross_revenue)}</td></tr>
<tr><td>− In transit / unconfirmed</td><td class="num negative">${formatIQD(-Math.max(0, overview.gross_revenue - overview.delivered_revenue))}</td></tr>
<tr><td><b>Delivered Revenue</b></td><td class="num"><b>${formatIQD(overview.delivered_revenue)}</b></td></tr>
<tr><td>− COGS</td><td class="num negative">${formatIQD(-overview.product_cost)}</td></tr>
<tr><td><b>Gross Profit</b></td><td class="num"><b>${formatIQD(overview.gross_profit)}</b></td></tr>
<tr><td>− Refunds / Returns</td><td class="num negative">${formatIQD(-overview.refund_value)}</td></tr>
<tr><td>− Expenses</td><td class="num negative">${formatIQD(-overview.expenses)}</td></tr>
<tr><td><b>Net Profit</b></td><td class="num ${tone(overview.net_profit)}"><b>${formatIQD(overview.net_profit)}</b></td></tr>
</table></section>

<section><h2>Cash Position</h2>
<div class="kpis">
    <div class="kpi"><div class="label">Collected</div><div class="value positive">${formatIQD(cash.cashCollected)}</div></div>
    <div class="kpi"><div class="label">In Transit</div><div class="value">${formatIQD(cash.cashInTransit)}</div></div>
    <div class="kpi"><div class="label">At Risk</div><div class="value ${cash.cashAtRisk > 0 ? "negative" : ""}">${formatIQD(cash.cashAtRisk)}</div></div>
</div></section>

${overview.by_channel.length > 0 ? `<section><h2>By Channel</h2><table>
<tr><th>Channel</th><th class="num">Revenue</th><th class="num">Orders</th><th class="num">Profit</th></tr>
${overview.by_channel.map(c => `<tr><td>${escapeHtml(c.label)}</td><td class="num">${formatIQD(c.revenue)}</td><td class="num">${c.orders}</td><td class="num ${tone(c.profit)}">${formatIQD(c.profit)}</td></tr>`).join("")}
</table></section>` : ""}

${overview.by_city.length > 0 ? `<section><h2>By City</h2><table>
<tr><th>City</th><th class="num">Revenue</th><th class="num">Orders</th><th class="num">Delivered</th></tr>
${overview.by_city.slice(0, 15).map(c => `<tr><td>${escapeHtml(c.label)}</td><td class="num">${formatIQD(c.revenue)}</td><td class="num">${c.orders}</td><td class="num">${c.delivered}</td></tr>`).join("")}
</table></section>` : ""}

</body></html>`;
    return html;
}

export function printFinanceHubReport(ctx: FinanceExportContext): void {
    const html = buildFinanceHubPrintHtml(ctx, new Date().toLocaleString());
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
}
