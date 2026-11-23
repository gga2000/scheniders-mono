import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { PeriodComparison } from "./period-comparison";
import { CityPerformance } from "./city-performance";
import { KPICards } from "./kpi-cards";
import { ReturnBreakdown } from "./return-breakdown";
import type { PeriodComparisonMetrics } from "@/lib/analytics/source-metrics";
import { formatIQD } from "@/lib/utils";
import { NO_RETURN_REASON, type CityPerformanceMetrics, type KPIMetrics, type ReturnAnalyticsMetrics } from "@/lib/analytics/reports-calculations";

afterEach(cleanup);
// The returns donut sizes itself with a ResizeObserver, which jsdom lacks.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

function inLanguage(language: "en" | "ar", ui: React.ReactElement) {
    localStorage.setItem("schneiders_language", language);
    return render(<LanguageProvider>{ui}</LanguageProvider>);
}

const empty = { totalOrders: 0, deliveredOrders: 0, rejectedOrders: 0, deliveryRate: 0, totalRevenue: 0, avgProcessingTime: 0 };
const range = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-31T00:00:00Z") };

function comparison(over: Partial<PeriodComparisonMetrics>): PeriodComparisonMetrics {
    return {
        current: { ...empty, totalOrders: 10, deliveredOrders: 8, rejectedOrders: 2, deliveryRate: 80 },
        previous: empty,
        changes: { orders: 0, deliveryRate: 0, revenue: 0, avgProcessingTime: 0 },
        ...over,
    };
}

describe("PeriodComparison", () => {
    it("says there is nothing to compare, and shows no change chips, when the previous period is empty", () => {
        const { container } = inLanguage("en", <PeriodComparison data={comparison({})} currentRange={range} />);
        expect(screen.getByText(/nothing to compare against/i)).toBeTruthy();
        expect(container.textContent).not.toMatch(/%\s*$|pp/);
    });

    it("shows the delivery-rate change in percentage points, not percent", () => {
        const data = comparison({
            previous: { ...empty, totalOrders: 10, deliveredOrders: 6, rejectedOrders: 4, deliveryRate: 60 },
            changes: { orders: 0, deliveryRate: 20, revenue: 0, avgProcessingTime: 0 },
        });
        inLanguage("en", <PeriodComparison data={data} currentRange={range} />);
        expect(screen.getByText(/20\.0\s*pp/)).toBeTruthy();
    });

    it("shows «—» and no trend for the rate and the time while nothing in the period has finished (critic r18)", () => {
        const data = comparison({
            current: { ...empty, totalOrders: 3, deliveryRate: null, avgProcessingTime: null },
            previous: { ...empty, totalOrders: 4, deliveredOrders: 4, deliveryRate: 100, avgProcessingTime: 49 },
            changes: { orders: -25, deliveryRate: null, revenue: 0, avgProcessingTime: null },
        });
        const { container } = inLanguage("ar", <PeriodComparison data={data} currentRange={range} />);
        expect(container.textContent).not.toMatch(/(?<![\d.])0\.0%/);
        expect(container.textContent).not.toMatch(/(?<!\d)0 ساعة/);
        expect(container.textContent).not.toMatch(/pp|نقطة/);
        expect(screen.getAllByText("—")).toHaveLength(2);
    });

    it("writes revenue in the one money format, never «8.1M»", () => {
        const data = comparison({
            current: { ...empty, totalOrders: 10, deliveredOrders: 8, rejectedOrders: 2, deliveryRate: 80, totalRevenue: 8_075_500 },
            previous: { ...empty, totalOrders: 9, deliveredOrders: 7, rejectedOrders: 2, deliveryRate: 77.8, totalRevenue: 8_529_250 },
        });
        const { container } = inLanguage("ar", <PeriodComparison data={data} currentRange={range} />);
        expect(container.textContent).toContain(formatIQD(8_075_500, "ar"));
        expect(container.textContent).toContain(formatIQD(8_529_250, "ar"));
        expect(container.textContent).not.toMatch(/\d(\.\d)?[MK]\b/);
    });

    it("lays the «مقابل» line out right to left in Arabic, so the word comes before its amount", () => {
        const data = comparison({
            current: { ...empty, totalOrders: 10, deliveredOrders: 8, rejectedOrders: 2, deliveryRate: 80, totalRevenue: 8_075_500 },
            previous: { ...empty, totalOrders: 9, deliveredOrders: 7, rejectedOrders: 2, deliveryRate: 77.8, totalRevenue: 8_529_250 },
        });
        inLanguage("ar", <PeriodComparison data={data} currentRange={range} />);
        const rows = Array.from(document.querySelectorAll("div")).filter((d) => d.firstElementChild?.textContent === "مقابل");
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) expect(row.getAttribute("dir")).toBe("rtl");
    });
});

describe("CityPerformance", () => {
    const city = (name: string, orders: number, days: number): CityPerformanceMetrics => ({
        city: name, totalOrders: orders, delivered: orders - 1, rejected: 1,
        deliveryRate: 90, avgDeliveryDays: days, noResponse: 0, trend: "stable",
    });

    it("ranks the podium by volume and writes day counts in the report language", () => {
        const data = [city("Erbil", 5, 2), city("Basra", 9, 3), city("Najaf", 7, 4), city("Mosul", 1, 1)];
        const { container } = inLanguage("ar", <CityPerformance data={data} />);
        const podium = Array.from(container.querySelectorAll("h4")).map((h) => h.textContent);
        expect(podium).toEqual(["Basra", "Najaf", "Erbil"]);
        expect(container.textContent).toContain("3.0 يوم");
        expect(container.textContent).not.toMatch(/\dd\b/);
    });
});

const kpis: KPIMetrics = {
    totalOrders: 8, totalOrdersChange: 0, deliveryRate: 50, deliveredCount: 1, decidedCount: 2, deliveryRateChange: 0, contactSuccessRate: 60, contactSuccessChange: 0,
    rejectionRate: 10, rejectionRateChange: 0, noResponseRate: 14.3, noResponseChange: 0, avgProcessingTime: 5, avgProcessingTimeChange: 0,
};

describe("KPICards", () => {
    it("says on the sales card how it adds up to the Orders page's count when the period has returns", () => {
        const { container } = inLanguage("ar", <KPICards metrics={kpis} returnsCount={1} />);
        expect(container.querySelector("[data-kpi-note]")?.textContent).toBe("+ استرجاع واحد = 9 في صفحة الطلبات");
        // The note is on the card, not hidden in a hover.
        expect(container.querySelector("[title]")?.getAttribute("title")).not.toMatch(/المرتجعات/);
    });

    it("adds no note when there are no returns, because the two counts already agree", () => {
        const { container } = inLanguage("ar", <KPICards metrics={kpis} returnsCount={0} />);
        expect(container.querySelector("[data-kpi-note]")).toBeNull();
    });

    it("puts the delivery rate's base on its card, and a dash while nothing has finished", () => {
        const { container } = inLanguage("ar", <KPICards metrics={kpis} returnsCount={0} />);
        expect(container.querySelector("[data-kpi-base]")?.textContent).toBe("سُلِّم 1 من 2 منتهية");
        cleanup();
        const none = inLanguage("ar", <KPICards metrics={{ ...kpis, deliveryRate: null, deliveredCount: 0, decidedCount: 0 }} returnsCount={0} />);
        expect(none.container.textContent).toContain("—");
        expect(none.container.querySelector("[data-kpi-base]")?.textContent).toBe("ما انتهى أي طلب بعد");
    });
});

function returnsData(over: Partial<ReturnAnalyticsMetrics>): ReturnAnalyticsMetrics {
    return {
        totalReturns: 9, totalReturnValue: 342000, returnRate: 4.7, avgReturnValue: 38000,
        returnsByReason: [{ reason: NO_RETURN_REASON, count: 9, percentage: 100, totalAmount: 342000, avgAmount: 38000, topCity: "بغداد" }],
        returnsByCity: [{ city: "بغداد", count: 9, totalAmount: 342000 }],
        returnTrend: "stable",
        ...over,
    };
}

describe("ReturnBreakdown", () => {
    it("labels the return rate and never ranks a missing reason as the top reason", () => {
        const { container } = inLanguage("ar", <ReturnBreakdown data={returnsData({})} />);
        expect(container.querySelector("[data-return-rate]")?.textContent).toBe("4.7% من المُسلَّمة");
        expect(container.querySelector("[data-return-insight]")?.textContent).toBe("لم يُسجَّل سبب لأي مرتجع في هذه الفترة");
        expect(container.textContent).toContain("بلا سبب مسجَّل");
        expect(container.textContent).not.toContain("غير محدد");
    });

    it("names the most common recorded reason even when unrecorded ones outnumber it", () => {
        const data = returnsData({
            returnsByReason: [
                { reason: NO_RETURN_REASON, count: 6, percentage: 66.7, totalAmount: 1, avgAmount: 1, topCity: "بغداد" },
                { reason: "المقاس صغير", count: 3, percentage: 33.3, totalAmount: 1, avgAmount: 1, topCity: "البصرة" },
            ],
        });
        const { container } = inLanguage("ar", <ReturnBreakdown data={data} />);
        expect(container.querySelector("[data-return-insight]")?.textContent).toBe("أكثر سبب للمرتجعات: المقاس صغير");
    });
});
