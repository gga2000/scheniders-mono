import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportsExportData } from "./reports-export";
import { exportReportsToCSV, printOperationalReport } from "./reports-export";
import { translations, type Locale } from "./i18n";
import { calculateKPIs } from "./analytics/reports-calculations";

const downloaded: { content: string }[] = [];
vi.mock("@/lib/order-export-utils", () => ({
    downloadFile: (content: string) => { downloaded.push({ content }); },
    generateExportFilename: () => "report.csv",
}));

function translator(locale: Locale): ReportsExportData["t"] {
    return (key, fallbackOrVars) => {
        const template = translations[locale][key] ?? (typeof fallbackOrVars === "string" ? fallbackOrVars : key);
        const vars = typeof fallbackOrVars === "object" ? fallbackOrVars : {};
        return template.replace(/\{(\w+)\}/g, (_m, name: string) => String(vars[name] ?? `{${name}}`));
    };
}

function data(locale: Locale, over: Partial<ReportsExportData> = {}): ReportsExportData {
    const kpis = { ...calculateKPIs([]), totalOrders: 10, totalOrdersChange: 4, deliveryRate: 80, deliveryRateChange: 2.1, rejectionRate: 20, rejectionRateChange: 3 };
    return {
        dateRange: { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-31T00:00:00Z") },
        kpis,
        statusFlow: [{ status: "delivered", label: "Delivered", count: 8, percentage: 80, color: "#000" }],
        contactAttempts: [],
        cityPerformance: [{ city: "<b>Basra</b>", totalOrders: 5, delivered: 4, rejected: 1, noResponse: 0, deliveryRate: 80, avgDeliveryDays: 2 }],
        rejectionReasons: [],
        timeAnalysis: { hourlyDistribution: [], dailyDistribution: [], processingTimeDistribution: [] },
        attentionFlags: [],
        t: translator(locale),
        rtl: locale === "ar",
        ...over,
    } as ReportsExportData;
}

describe("reports export", () => {
    beforeEach(() => { downloaded.length = 0; });
    afterEach(() => { vi.unstubAllGlobals(); });

    it("CSV shows rate changes in pp and count changes in %, in the report language", () => {
        exportReportsToCSV(data("en"));
        const csv = downloaded[0]?.content ?? "";
        expect(csv).toContain('"▲ 2.1 pp"');
        expect(csv).toContain('"▲ 4.0%"');
        expect(csv).toContain("Operational Report");
        downloaded.length = 0;
        exportReportsToCSV(data("ar"));
        expect(downloaded[0]?.content).toContain("التقرير التشغيلي");
    });

    it("CSV leaves the change blank when nothing moved", () => {
        exportReportsToCSV(data("en", { kpis: { ...data("en").kpis, deliveryRateChange: 0 } }));
        expect(downloaded[0]?.content).not.toContain("0.0 pp");
    });

    it("print is RTL for Arabic only and escapes customer-supplied city names", () => {
        const write = vi.fn();
        vi.stubGlobal("window", { open: () => ({ document: { write, close: vi.fn() }, focus: vi.fn(), print: vi.fn() }) });
        printOperationalReport(data("ar"));
        const html = String(write.mock.calls[0]?.[0]);
        expect(html).toContain('<html lang="ar" dir="rtl">');
        expect(html).toContain("&lt;b&gt;Basra&lt;/b&gt;");
        expect(html).not.toContain("<b>Basra</b>");
        write.mockClear();
        printOperationalReport(data("en"));
        expect(String(write.mock.calls[0]?.[0])).toContain('<html lang="en" dir="ltr">');
    });

    it("print colours a falling rejection rate as good", () => {
        const write = vi.fn();
        vi.stubGlobal("window", { open: () => ({ document: { write, close: vi.fn() }, focus: vi.fn(), print: vi.fn() }) });
        const base = data("en");
        printOperationalReport({ ...base, kpis: { ...base.kpis, rejectionRateChange: -3 } });
        expect(String(write.mock.calls[0]?.[0])).toMatch(/class="change positive">-3\.0 pp/);
    });
});
