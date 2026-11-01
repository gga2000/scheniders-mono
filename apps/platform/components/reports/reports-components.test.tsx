import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { PeriodComparison } from "./period-comparison";
import { CityPerformance } from "./city-performance";
import type { PeriodComparisonMetrics } from "@/lib/analytics/source-metrics";
import type { CityPerformanceMetrics } from "@/lib/analytics/reports-calculations";

afterEach(cleanup);

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
});

describe("CityPerformance", () => {
    const city = (name: string, orders: number, days: number): CityPerformanceMetrics => ({
        city: name, governorateCode: "BG", totalOrders: orders, delivered: orders - 1, rejected: 1,
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
