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

const stat = (key: string) => document.querySelector(`[data-stat="${key}"]`)?.textContent;

/**
 * While the All Orders preview is on screen the panel stays at the merchant's
 * level and only its figures wait: collapsing it to 0 and animating it back
 * open when the window landed moved every row of the list below it.
 */
describe("OrdersAnalyticsPanel while its figures are not ready", () => {
    it("keeps both rows open and shows every row-derived figure as a dash", () => {
        renderPanel({ statsHidden: true, countsHidden: true, flaggedCountHidden: true });
        for (const key of ["conversion", "confirm_speed", "delivery_speed", "peak_hour", "today_revenue", "today_orders", "average_order_value"]) {
            expect(stat(key)).toBe("—");
        }
        // The level-2 row is still laid out: the panel keeps its height.
        expect(attention("urgent")).toBe("—");
        expect(document.body.textContent).not.toContain("12.5%");
        expect(document.body.textContent).not.toContain("14:00");
    });

    it("draws the conversion bar empty rather than at a guessed rate", () => {
        renderPanel({ statsHidden: true });
        const bar = document.querySelector<HTMLElement>("[data-stat-bar=\"conversion\"]");
        expect(bar?.style.width).toBe("0%");
    });

    it("shows the figures once they are ready", () => {
        renderPanel();
        expect(stat("conversion")).toBe("12.5%");
        expect(stat("confirm_speed")).toBe("1h");
        expect(stat("delivery_speed")).toBe("2d");
        expect(stat("peak_hour")).toBe("14:00");
        expect(stat("today_orders")).toBe("4");
        const bar = document.querySelector<HTMLElement>("[data-stat-bar=\"conversion\"]");
        expect(bar?.style.width).toBe("12.5%");
    });
});
