import { describe, expect, it } from "vitest";
import type { FinanceOverviewResult } from "@/hooks/use-finance-overview";
import type { FinanceRevenueResult } from "@/hooks/use-finance-revenue";
import type { CashPositionResult } from "@/hooks/use-cash-position";
import { buildFinanceHubCsv, buildFinanceHubPrintHtml, type FinanceExportContext } from "./finance-hub-export";

const overview = {
    gross_revenue: 1_000_000, net_revenue: 950_000, delivered_revenue: 800_000, refund_value: 50_000,
    product_cost: 300_000, delivery_cost: 0, expenses: 100_000, marketing_cost: 0,
    gross_profit: 500_000, net_profit: 350_000, margin_pct: 43.75, orders_count: 40, delivered_count: 32,
    aov: 25_000, delivery_rate: 80,
    by_channel: [{ key: "x", label: "<img src=x onerror=alert(1)>", revenue: 1, orders: 1, profit: 1 }],
    by_city: [{ key: "y", label: "بغداد", revenue: 2, orders: 1, delivered: 1, profit: 1 }],
    by_product: [{ key: "p", label: "=HYPERLINK(\"http://evil\")", revenue: 3, units: 1, profit: 1, margin: 10 }],
    by_payment: [],
    series: [],
} as unknown as FinanceOverviewResult;

const ctx: FinanceExportContext = {
    language: "en",
    overview,
    revenue: { refunds: { top_refunded: [] } } as unknown as FinanceRevenueResult,
    cash: {
        cashCollected: 1, cashInTransit: 2, cashConfirmed: 3, cashAtRisk: 4, netProjection: 5, historicalDeliveryRate: 80,
    } as unknown as CashPositionResult,
    // 1 Oct 00:00 to 31 Oct 23:59 Baghdad.
    period: { start: new Date("2026-09-30T21:00:00.000Z"), end: new Date("2026-10-31T20:59:59.999Z") },
};

describe("buildFinanceHubCsv", () => {
    const csv = buildFinanceHubCsv(ctx, "2026-11-01T00:00:00.000Z");

    it("labels the period with Baghdad days, not the UTC day before", () => {
        expect(csv).toContain("Period: 2026-10-01 to 2026-10-31");
        expect(csv).not.toContain("2026-09-30");
    });

    it("writes a customer-supplied name that starts with = as plain text", () => {
        expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
        expect(csv).not.toMatch(/(^|,)"=HYPERLINK/m);
    });

    it("keeps negative numbers numeric", () => {
        expect(csv).toContain(`"- COGS","-300000"`);
    });
});

describe("buildFinanceHubPrintHtml", () => {
    const html = buildFinanceHubPrintHtml(ctx, "1/11/2026");

    it("escapes channel names so they cannot inject markup into the print window", () => {
        expect(html).not.toContain("<img src=x");
        expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    });

    it("titles the report with the Baghdad period", () => {
        expect(html).toContain("2026-10-01 to 2026-10-31");
    });
});

describe("Arabic export", () => {
    const ar: FinanceExportContext = { ...ctx, language: "ar" };

    it("words the CSV in Arabic and still guards data cells", () => {
        const csv = buildFinanceHubCsv(ar, "2026-11-01T00:00:00.000Z");
        expect(csv).toContain('"تقرير المالية"');
        expect(csv).toContain('"صافي الربح"');
        expect(csv).not.toContain('"Net Profit"');
        expect(csv).toContain("\"'=HYPERLINK");
    });

    it("prints right-to-left with Arabic labels, only in the print document", () => {
        const html = buildFinanceHubPrintHtml(ar, "2026-11-01");
        expect(html).toContain('<html lang="ar" dir="rtl">');
        expect(html).toContain("ملخص المؤشرات");
        expect(html).not.toContain("Gross Revenue");
        expect(html).toContain("د.ع");
        expect(html).not.toContain("IQD");
        expect(html).not.toContain("<img src=x");
    });

    it("keeps English printing left-to-right", () => {
        const html = buildFinanceHubPrintHtml(ctx, "2026-11-01");
        expect(html).toContain('<html lang="en">');
        expect(html).not.toContain("dir=");
    });
});
