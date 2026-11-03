/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { ComponentProps } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { PanelStats } from "@/lib/orders/analytics-strip";
import { OrdersAnalyticsPanel } from "./orders-analytics-panel";


const asked = vi.hoisted(() => ({ filters: [] as unknown[] }));
const hookResult = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/hooks/use-orders-panel-stats", () => ({
    useOrdersPanelStats: (filters: unknown) => {
        asked.filters.push(filters);
        return hookResult.value;
    },
}));

afterEach(() => {
    cleanup();
    asked.filters.length = 0;
});

const query = <T,>(data: T | undefined, isError = false) => ({ data, isError, refetch: vi.fn() });

const stats = (over: Partial<PanelStats> = {}): PanelStats => ({
    orders: 40,
    revenue: 1_250_000,
    confirmed_revenue: 2_000_000,
    delivered: 10,
    ...over,
});

function setHook(over: Record<string, unknown> = {}) {
    hookResult.value = {
        salesView: true,
        windows: { previous: {} },
        current: query(stats()),
        previous: query(stats({ orders: 20, revenue: 1_000_000 })),
        store: { figures: null, show: false },
        ads: null,
        ...over,
    };
}

type Props = ComponentProps<typeof OrdersAnalyticsPanel>;

function renderPanel(props: Partial<Props> = {}) {
    render(
        <LanguageProvider>
            <OrdersAnalyticsPanel
                open
                filters={{}}
                setFilters={() => {}}
                flaggedCount={3}
                attentionCounts={{ urgent: 11, noResponse: 12, returnPending: 0 }}
                {...props}
            />
        </LanguageProvider>,
    );
}

const stat = (key: string) => document.querySelector(`[data-stat="${key}"]`)?.textContent;
const sub = (key: string) => document.querySelector(`[data-sub="${key}"]`)?.textContent;
const attention = (key: string) => document.querySelector(`[data-attention="${key}"]`)?.textContent;

describe("OrdersAnalyticsPanel strip", () => {
    it("renders nothing while closed", () => {
        setHook();
        renderPanel({ open: false });
        expect(document.querySelector("[data-testid=\"orders-analytics-strip\"]")).toBeNull();
    });

    it("shows the server figures", () => {
        setHook();
        renderPanel();
        expect(stat("orders")).toBe("40");
        expect(stat("revenue")).toContain("2,000,000");
    });

    it("keeps a skeleton, not a zero, while a figure loads", () => {
        setHook({ current: query(undefined) });
        renderPanel();
        expect(stat("orders")).toBeUndefined();
    });

    it("offers a retry when the numbers fail to load", () => {
        const current = query(undefined, true);
        setHook({ current });
        renderPanel();
        expect(document.querySelector("[data-stat=\"orders\"]")).toBeNull();
        fireEvent.click(document.querySelector("[data-testid=\"orders-analytics-retry\"]") as HTMLElement);
        expect(current.refetch).toHaveBeenCalled();
    });

    it("reads the filters the page has applied", () => {
        setHook();
        renderPanel({ filters: { dateFrom: "2026-11-01", dateTo: "2026-11-03", city: "Basra" } as Props["filters"] });
        expect(asked.filters.at(-1)).toEqual({ dateFrom: "2026-11-01", dateTo: "2026-11-03", city: "Basra" });
    });

    it("says so instead of showing zeros while a refund or replacement view is open", () => {
        setHook({ salesView: false });
        renderPanel();
        expect(stat("orders")).toBeUndefined();
        expect(document.querySelector("[data-testid=\"orders-analytics-strip\"]")?.textContent).toContain("المبيعات");
    });

    it("shows no change arrows when there is no earlier period to compare with", () => {
        setHook({ windows: { previous: null } });
        renderPanel();
        expect(document.querySelector("[data-cell=\"orders\"] svg")).toBeNull();
    });

    it("leaves out the billing cells when Meta gives no balance", () => {
        setHook({ ads: { spend: query({ usd: 291, iqd: 500_000 }), billing: query(null) } });
        renderPanel();
        expect(document.querySelector("[data-cell=\"ad_owed\"]")).toBeNull();
        expect(document.querySelector("[data-cell=\"ad_limit\"]")).toBeNull();
        expect(stat("cpa")).toContain("12,500");
    });

    it("only draws the Meta and store cells when they apply", () => {
        setHook();
        renderPanel();
        expect(document.querySelector("[data-cell=\"ad_spend\"]")).toBeNull();
        expect(document.querySelector("[data-cell=\"visitors\"]")).toBeNull();
        cleanup();
        setHook({
            ads: { spend: query({ usd: 291, iqd: 500_000 }), billing: query({ owedUsd: 341.8, owedIqd: 586_900, leftUsd: 80.2, leftIqd: 137_700 }) },
            store: { figures: { current: { visitors: 300, conversion: 2.5 }, previous: { visitors: 200, conversion: 2 } }, show: true },
        });
        renderPanel();
        expect(stat("ad_spend")).toBe("$291.00");
        expect(sub("ad_spend")).toContain("500,000");
        expect(stat("cpa")).toContain("12,500");
        expect(stat("ad_owed")).toBe("$341.80");
        expect(sub("ad_owed")).toContain("586,900");
        expect(stat("ad_limit")).toBe("$80.20");
        expect(sub("ad_limit")).toContain("137,700");
        expect(stat("visitors")).toBe("300");
        expect(stat("conversion")).toBe("2.5%");
    });
});

describe("OrdersAnalyticsPanel attention pills", () => {
    it("lists only the non-zero counts", () => {
        setHook();
        renderPanel();
        expect(attention("flagged")).toBe("3");
        expect(attention("urgent")).toBe("11");
        expect(attention("no_response")).toBe("12");
        expect(attention("return_pending")).toBeUndefined();
    });

    it("hides the status-derived pills while their list is not the one on screen", () => {
        setHook();
        renderPanel({ countsHidden: true });
        expect(attention("flagged")).toBe("3");
        expect(attention("urgent")).toBeUndefined();
    });

    it("applies the matching filter on click", () => {
        setHook();
        const setFilters = vi.fn();
        renderPanel({ setFilters, filters: { city: "x" } as Props["filters"] });
        fireEvent.click(document.querySelector("[data-attention=\"no_response\"]")?.parentElement as HTMLElement);
        expect(setFilters).toHaveBeenCalledWith({ city: "x", status: "no_response" });
    });
});

describe("OrdersAnalyticsPanel attention pills as switches", () => {
    it("lifts the filter on a second click", () => {
        setHook();
        const setFilters = vi.fn();
        renderPanel({ setFilters, filters: { status: "no_response" } as Props["filters"] });
        const pill = document.querySelector("[data-attention=\"no_response\"]")?.parentElement as HTMLElement;
        expect(pill.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(pill);
        expect(setFilters).toHaveBeenCalledWith({ status: "all" });
    });

    it("keeps an active pill on screen when its count is hidden or zero", () => {
        setHook();
        renderPanel({ countsHidden: true, attentionCounts: { urgent: 0, noResponse: 0, returnPending: 0 }, filters: { priority: "urgent" } as Props["filters"] });
        expect(attention("urgent")).toBe("×");
        expect(attention("no_response")).toBeUndefined();
    });
});
