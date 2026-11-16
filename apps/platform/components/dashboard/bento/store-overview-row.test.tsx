/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { storeOverviewSchema } from "@/lib/analytics/store-overview";
import { StoreOverviewRow } from "./store-overview-row";

afterEach(cleanup);

const data = storeOverviewSchema.parse({
    days: Array.from({ length: 10 }, (_, i) => ({ day: `2026-11-${String(7 + i).padStart(2, "0")}`, visitors: 20, orders: 1, sales: 25_000 })),
    yesterday_same_time: { visitors: 10, orders: 0, sales: 0 },
});

vi.mock("@/hooks/use-store-overview", () => ({
    useStoreOverview: () => ({ data, isError: false, refetch: vi.fn() }),
}));

const renderRow = () => {
    localStorage.setItem("schneiders_language", "ar");
    return render(<LanguageProvider><StoreOverviewRow range="7d" /></LanguageProvider>);
};

/** Each card's heading hover, by the card's name. */
const hovers = () => Object.fromEntries(
    Array.from(document.querySelectorAll("section[aria-label] h3")).map((h) => [h.closest("section")?.getAttribute("aria-label"), h.getAttribute("title")]),
);

describe("store overview cards", () => {
    it("says on each card what that card counts, in standard Arabic", () => {
        renderRow();
        const byCard = hovers();
        expect(byCard["زوار المتجر"]).toBe("زيارات موقع متجرك فقط.");
        expect(byCard["طلبات المتجر الإلكتروني"]).toContain("الطلبات من موقع متجرك فقط");
        // The visitors card no longer talks about orders, and no card is in dialect.
        expect(byCard["زوار المتجر"]).not.toContain("الطلبات");
        for (const hover of Object.values(byCard)) expect(hover).not.toMatch(/اللي|تلقاها|ينزلها/);
        expect(new Set(Object.values(byCard)).size).toBe(6);
    });

    it("names sales per visitor for what it is, not profit", () => {
        renderRow();
        expect(hovers()["المبيعات لكل زائر"]).toBe("مبيعات الموقع مقسومة على زوار الموقع.");
        expect(document.body.textContent).not.toContain("الربح لكل زائر");
    });
});
