import { describe, expect, it } from "vitest";
import type { OrderFilters } from "@/types/order";
import { hasNarrowingFilters } from "./filter-orders";

describe("hasNarrowingFilters (lights the «فلتر» button)", () => {
    it("stays off on the default «اليوم»: the period has its own button", () => {
        const today: OrderFilters = { status: "all", dateFrom: "2026-11-16", dateTo: "2026-11-16" };
        expect(hasNarrowingFilters(today)).toBe(false);
        expect(hasNarrowingFilters({})).toBe(false);
    });

    it("turns on for any pick that narrows the list", () => {
        expect(hasNarrowingFilters({ city: "بغداد" })).toBe(true);
        expect(hasNarrowingFilters({ product: "عطر" })).toBe(true);
        expect(hasNarrowingFilters({ paymentStatus: "prepaid" })).toBe(true);
        expect(hasNarrowingFilters({ priority: "urgent" })).toBe(true);
        expect(hasNarrowingFilters({ adChannel: "instagram" })).toBe(true);
        expect(hasNarrowingFilters({ adCampaign: "c1" })).toBe(true);
    });
});
