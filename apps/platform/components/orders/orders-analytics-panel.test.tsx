/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { ComponentProps } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { countOrderChips } from "@/lib/orders/order-chips";
import { OrdersAnalyticsPanel } from "./orders-analytics-panel";

afterEach(cleanup);

type Props = ComponentProps<typeof OrdersAnalyticsPanel>;

const stats = {
    conversionRate: 12.5,
    velocityMetrics: { avgNewToConfirmed: "1h", avgConfirmedToDelivered: "2d" },
    peakTime: "14:00",
    todayRevenue: 100000,
    todayOrders: 4,
    averageOrderValue: 25000,
    // RPC values that must NOT be what Needs Attention shows.
    urgentOrders: 91,
    noResponseOrders: 92,
    returnPendingOrders: 93,
} as unknown as Props["stats"];

const statusCounts = { ...countOrderChips([]), new: 4, contacted: 5, confirmed: 6, in_transit: 7 };

function renderPanel(props: Partial<Props> = {}) {
    render(
        <LanguageProvider>
            <OrdersAnalyticsPanel
                analyticsLevel={2}
                stats={stats}
                statusCounts={statusCounts}
                filters={{}}
                setFilters={() => {}}
                flaggedCount={3}
                attentionCounts={{ urgent: 11, noResponse: 12, returnPending: 13 }}
                {...props}
            />
        </LanguageProvider>,
    );
}

const attention = (key: string) => document.querySelector(`[data-attention="${key}"]`)?.textContent;

describe("OrdersAnalyticsPanel Needs Attention", () => {
    it("shows the list-derived attention counts, not the RPC stats", () => {
        renderPanel();
        expect(attention("flagged")).toBe("3");
        expect(attention("urgent")).toBe("11");
        expect(attention("no_response")).toBe("12");
        expect(attention("return_pending")).toBe("13");
    });

    it("renders every count as a dash while hidden", () => {
        renderPanel({ countsHidden: true, flaggedCountHidden: true });
        for (const key of ["flagged", "urgent", "no_response", "return_pending"]) expect(attention(key)).toBe("—");
        const headline = [...document.querySelectorAll("h3")].map((h) => h.textContent);
        expect(headline.filter((t) => t === "—")).toHaveLength(4);
    });

    it("keeps the flagged count when only the status counts are hidden", () => {
        renderPanel({ countsHidden: true });
        expect(attention("flagged")).toBe("3");
        expect(attention("urgent")).toBe("—");
    });
});
