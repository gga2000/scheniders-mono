import { formatIQD } from "@/lib/utils";
import { translations, type Locale } from "@/lib/i18n";
import { baghdadDayKey } from "@/lib/order-window";
import type { FinanceOverviewResult } from "@/hooks/use-finance-overview";
import type { FinanceRevenueResult } from "@/hooks/use-finance-revenue";
import type { CashPositionResult } from "@/hooks/use-cash-position";

export interface FinanceExportContext {
    /** Active UI language; Arabic prints right-to-left and words every label in Arabic. */
    language: Locale;
    overview: FinanceOverviewResult;
    revenue: FinanceRevenueResult;
    cash: CashPositionResult;
    period: { start: Date; end: Date };
}

/** One export label in the report's language (keys live under finances.export.* in lib/i18n.ts). */
function labeller(language: Locale): (key: string) => string {
    const dict = translations[language];
    return (key) => dict[`finances.export.${key}`] ?? translations.en[`finances.export.${key}`] ?? key;
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
    const x = labeller(ctx.language);
    const rows: (string | number)[][] = [];

    rows.push([x("title")]);
    rows.push([x("period").replace("{from}", ymd(period.start)).replace("{to}", ymd(period.end))]);
    rows.push([x("generated").replace("{at}", generatedAt)]);
    rows.push([]);

    rows.push([x("kpiSummary")]);
    rows.push([x("metric"), x("valueIqd")]);
    rows.push([x("grossRevenue"), overview.gross_revenue]);
    rows.push([x("netRevenue"), overview.net_revenue]);
    rows.push([x("deliveredRevenue"), overview.delivered_revenue]);
    rows.push([x("refundValue"), overview.refund_value]);
    rows.push([x("cogs"), overview.product_cost]);
    rows.push([x("deliveryCost"), overview.delivery_cost]);
    rows.push([x("expenses"), overview.expenses]);
    rows.push([x("marketingCost"), overview.marketing_cost]);
    rows.push([x("grossProfit"), overview.gross_profit]);
    rows.push([x("netProfit"), overview.net_profit]);
    rows.push([x("netMarginPct"), `${overview.margin_pct.toFixed(2)}%`]);
    rows.push([x("ordersCount"), overview.orders_count]);
    rows.push([x("deliveredCount"), overview.delivered_count]);
    rows.push([x("aov"), overview.aov]);
    rows.push([x("deliveryRatePct"), `${overview.delivery_rate.toFixed(2)}%`]);
    rows.push([]);

    rows.push([x("waterfall")]);
    rows.push([x("step"), x("valueIqd")]);
    rows.push([x("grossRevenue"), overview.gross_revenue]);
    rows.push([x("inTransitDeduct"), -Math.max(0, overview.gross_revenue - overview.delivered_revenue)]);
    rows.push([x("deliveredRevenue"), overview.delivered_revenue]);
    rows.push([x("cogsDeduct"), -overview.product_cost]);
    rows.push([x("grossProfit"), overview.gross_profit]);
    rows.push([x("refundsDeduct"), -overview.refund_value]);
    rows.push([x("expensesDeduct"), -overview.expenses]);
    rows.push([x("netProfit"), overview.net_profit]);
    rows.push([]);

    rows.push([x("cashPosition")]);
    rows.push([x("bucket"), x("valueIqd")]);
    rows.push([x("collected"), cash.cashCollected]);
    rows.push([x("inTransit"), cash.cashInTransit]);
    rows.push([x("confirmed"), cash.cashConfirmed]);
    rows.push([x("atRisk"), cash.cashAtRisk]);
    rows.push([x("netProjection"), cash.netProjection]);
    rows.push([x("histDeliveryRate"), `${cash.historicalDeliveryRate.toFixed(2)}%`]);
    rows.push([]);

    if (overview.by_channel.length > 0) {
        rows.push([x("byChannel")]);
        rows.push([x("channel"), x("revenueIqd"), x("orders"), x("profitIqd")]);
        for (const c of overview.by_channel) {
            rows.push([plainText(c.label), c.revenue, c.orders, c.profit]);
        }
        rows.push([]);
    }

    if (overview.by_city.length > 0) {
        rows.push([x("byCity")]);
        rows.push([x("city"), x("revenueIqd"), x("orders"), x("delivered"), x("profitIqd")]);
        for (const c of overview.by_city) {
            rows.push([plainText(c.label), c.revenue, c.orders, c.delivered, c.profit]);
        }
        rows.push([]);
    }

    if (overview.by_product.length > 0) {
        rows.push([x("byProduct")]);
        rows.push([x("product"), x("revenueIqd"), x("units"), x("profitIqd"), x("marginPct")]);
        for (const p of overview.by_product) {
            rows.push([plainText(p.label), p.revenue, p.units, p.profit, `${p.margin.toFixed(2)}%`]);
        }
        rows.push([]);
    }

    if (overview.by_payment.length > 0) {
        rows.push([x("byPayment")]);
        rows.push([x("method"), x("revenueIqd"), x("orders")]);
        for (const p of overview.by_payment) {
            rows.push([plainText(p.label), p.revenue, p.orders]);
        }
        rows.push([]);
    }

    if (revenue.refunds.top_refunded && revenue.refunds.top_refunded.length > 0) {
        rows.push([x("topRefunded")]);
        rows.push([x("product"), x("refundValueIqd"), x("unitsReturned")]);
        for (const p of revenue.refunds.top_refunded) {
            rows.push([plainText(p.name), p.value, p.count]);
        }
        rows.push([]);
    }

    if (overview.series.length > 0) {
        rows.push([x("timeSeries")]);
        rows.push([x("bucket"), x("revenueIqd"), x("deliveredRevenue"), x("orders"), x("delivered"), x("productCost"), x("deliveryCost"), x("expenses"), x("profit")]);
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
    const x = labeller(ctx.language);
    const rtl = ctx.language === "ar";
    const range = x("range").replace("{from}", ymd(period.start)).replace("{to}", ymd(period.end));
    const money = (n: number) =>
        rtl ? `<bdi>${n < 0 ? "-" : ""}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.abs(n))} ${x("iqd")}</bdi>` : formatIQD(n);
    const tone = (n: number) => (n >= 0 ? "positive" : "negative");
    const html = `<!doctype html>
<html lang="${ctx.language}"${rtl ? ' dir="rtl"' : ""}><head><meta charset="utf-8"><title>${x("title")} — ${range}</title>
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
th, td { padding: 6px 10px; border-bottom: 1px solid #eee; text-align: start; }
th { background: #fafafa; font-weight: 600; }
td.num, th.num { text-align: end; font-variant-numeric: tabular-nums; }
@media print { body { padding: 16px; } section { page-break-inside: avoid; } }
</style></head><body>
<h1>${x("title")}</h1>
<div class="sub">${range} · ${x("generated").replace("{at}", escapeHtml(generatedAt))}</div>

<section><h2>${x("kpiSummaryH")}</h2>
<div class="kpis">
    <div class="kpi"><div class="label">${x("grossRevenue")}</div><div class="value">${money(overview.gross_revenue)}</div></div>
    <div class="kpi"><div class="label">${x("netProfit")}</div><div class="value ${tone(overview.net_profit)}">${money(overview.net_profit)}</div></div>
    <div class="kpi"><div class="label">${x("netMargin")}</div><div class="value">${overview.margin_pct.toFixed(1)}%</div></div>
    <div class="kpi"><div class="label">${x("orders")}</div><div class="value">${overview.orders_count}</div></div>
    <div class="kpi"><div class="label">${x("aov")}</div><div class="value">${money(overview.aov)}</div></div>
    <div class="kpi"><div class="label">${x("deliveryRate")}</div><div class="value">${overview.delivery_rate.toFixed(1)}%</div></div>
</div></section>

<section><h2>${x("pnl")}</h2>
<table>
<tr><td>${x("grossRevenue")}</td><td class="num">${money(overview.gross_revenue)}</td></tr>
<tr><td>${x("inTransitDeduct")}</td><td class="num negative">${money(-Math.max(0, overview.gross_revenue - overview.delivered_revenue))}</td></tr>
<tr><td><b>${x("deliveredRevenue")}</b></td><td class="num"><b>${money(overview.delivered_revenue)}</b></td></tr>
<tr><td>${x("cogsDeduct")}</td><td class="num negative">${money(-overview.product_cost)}</td></tr>
<tr><td><b>${x("grossProfit")}</b></td><td class="num"><b>${money(overview.gross_profit)}</b></td></tr>
<tr><td>${x("refundsDeduct")}</td><td class="num negative">${money(-overview.refund_value)}</td></tr>
<tr><td>${x("expensesDeduct")}</td><td class="num negative">${money(-overview.expenses)}</td></tr>
<tr><td><b>${x("netProfit")}</b></td><td class="num ${tone(overview.net_profit)}"><b>${money(overview.net_profit)}</b></td></tr>
</table></section>

<section><h2>${x("cashPositionH")}</h2>
<div class="kpis">
    <div class="kpi"><div class="label">${x("collected")}</div><div class="value positive">${money(cash.cashCollected)}</div></div>
    <div class="kpi"><div class="label">${x("inTransit")}</div><div class="value">${money(cash.cashInTransit)}</div></div>
    <div class="kpi"><div class="label">${x("atRisk")}</div><div class="value ${cash.cashAtRisk > 0 ? "negative" : ""}">${money(cash.cashAtRisk)}</div></div>
</div></section>

${overview.by_channel.length > 0 ? `<section><h2>${x("byChannelH")}</h2><table>
<tr><th>${x("channel")}</th><th class="num">${x("revenue")}</th><th class="num">${x("orders")}</th><th class="num">${x("profit")}</th></tr>
${overview.by_channel.map(c => `<tr><td>${escapeHtml(c.label)}</td><td class="num">${money(c.revenue)}</td><td class="num">${c.orders}</td><td class="num ${tone(c.profit)}">${money(c.profit)}</td></tr>`).join("")}
</table></section>` : ""}

${overview.by_city.length > 0 ? `<section><h2>${x("byCityH")}</h2><table>
<tr><th>${x("city")}</th><th class="num">${x("revenue")}</th><th class="num">${x("orders")}</th><th class="num">${x("delivered")}</th></tr>
${overview.by_city.slice(0, 15).map(c => `<tr><td>${escapeHtml(c.label)}</td><td class="num">${money(c.revenue)}</td><td class="num">${c.orders}</td><td class="num">${c.delivered}</td></tr>`).join("")}
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
