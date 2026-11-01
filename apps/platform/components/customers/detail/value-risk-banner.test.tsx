// @vitest-environment jsdom
// The last-N outcome bars run newest first, left to right, like Order history,
// and their caption counts them with the language's plural form.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        language: "en",
        t: (key: string, vars?: string | Record<string, string | number>) => (typeof vars === "object" && "count" in vars ? `${key}:${vars.count}` : key),
    }),
}));

import { CustomerValueRiskBanner, type CustomerReliability } from "./value-risk-banner";

afterEach(cleanup);

const reliability: CustomerReliability = {
    total_orders: 3, total_spent: 100_000, completed_count: 1, cancelled_count: 0, no_response_count: 0,
    rejected_count: 2, returned_count: 0, refund_count: 0, value_tier: "newcomer", risk_level: "high",
};

describe("CustomerValueRiskBanner last outcomes", () => {
    it("draws the newest order first, on the left", () => {
        // Orders arrive newest first, as Order history lists them.
        render(<CustomerValueRiskBanner reliability={reliability} successRate={33} orders={[
            { id: "c", status: "delivered" }, { id: "b", status: "rejected" }, { id: "a", status: "rejected" },
        ]} />);
        const caption = screen.getByText("customers.banner.lastOutcomes:3");
        const bars = [...(caption.previousElementSibling?.children ?? [])].map((b) => b.className);
        expect(bars[0]).toContain("bg-emerald-500");
        expect(bars[1]).toContain("bg-rose-500");
        expect(bars[2]).toContain("bg-rose-500");
        expect(caption.parentElement?.getAttribute("title")).toBe("customers.identity.order");
    });

    it("passes the finished count as a number, so Arabic picks its plural form", () => {
        render(<CustomerValueRiskBanner reliability={reliability} successRate={33} orders={[
            { id: "c", status: "delivered" }, { id: "b", status: "rejected" }, { id: "a", status: "rejected" },
        ]} />);
        expect(screen.getByText("customers.banner.rateBase:3")).toBeTruthy();
    });
});
