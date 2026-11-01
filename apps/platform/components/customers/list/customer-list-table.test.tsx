// @vitest-environment jsdom
// The toolbar and the column header are one sticky block: the header sticks at the
// toolbar's measured height (no fixed number that drifts), and the page's scroll
// padding covers the whole block, so a row brought into view is never under it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (key: string) => key, language: "en" }),
}));

import { CustomerListTable } from "./customer-list-table";

const observers: ResizeObserverCallback[] = [];
class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) { observers.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
}
const HEAD_HEIGHT = 44.5;

beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height: HEAD_HEIGHT }) as DOMRect);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const customer: PaginatedCustomer = {
    phone: "07701234567", name: "Ahmed", has_name: true, city: null, governorate: "BG",
    total_orders: 4, total_spent: 120000, last_order_date: new Date().toISOString(), first_order_date: new Date().toISOString(),
    calculated_status: "regular", is_blacklisted: false, total_items: 4, trust_score: 90, trust_tier: "gold",
    delivery_success_rate: 100, community_avg_rating: 0, cancelled_count: 0, no_response_count: 0, rejected_count: 0,
    returned_count: 0, refund_count: 0, completed_count: 4, value_tier: "vip", risk_level: "clean",
    severe_count: 0, recent_severe_count: 0, moderate_count: 0, recent_moderate_count: 0,
};

describe("CustomerListTable sticky header", () => {
    it("sticks every header cell at the toolbar's measured height", () => {
        const { container } = render(<CustomerListTable customers={[customer]} onRowClick={() => {}} onToggleSelect={() => {}} stickyTop={70.5} />);
        const cells = [...container.querySelectorAll("th")];
        expect(cells.length).toBeGreaterThan(0);
        for (const th of cells) {
            expect(th.style.top).toBe("70.5px");
            expect(th.className).toContain("sticky");
            // Square once stuck: the rounded corners come from the clipped wrapper, so no corner gap shows rows.
            expect(th.className).not.toMatch(/rounded/);
        }
        expect(container.firstElementChild?.className).toContain("overflow-clip");
    });

    it("pads the page's scroll by the whole sticky block and clears it on unmount", () => {
        const { unmount } = render(<CustomerListTable customers={[customer]} onRowClick={() => {}} stickyTop={70} />);
        act(() => { for (const cb of observers) cb([], {} as ResizeObserver); });
        expect(document.documentElement.style.scrollPaddingTop).toBe(`${70 + HEAD_HEIGHT}px`);
        unmount();
        expect(document.documentElement.style.scrollPaddingTop).toBe("");
    });
});
