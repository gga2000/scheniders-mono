/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render as rtlRender, screen, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/lib/supabase";
import type { Expense } from "@/types/expense";
import { ForecastsTab } from "./forecasts-tab";

// The status-history lookup needs a database; the tab only needs its result.
vi.mock("@/hooks/use-in-transit-since", () => ({ useInTransitSince: () => new Map<string, string>() }));

// jsdom has no layout engine; recharts' ResponsiveContainer only needs the constructor.
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });
afterEach(cleanup);

const period = {
    start: new Date("2026-09-30T21:00:00.000Z"),
    end: new Date("2026-10-31T20:59:59.999Z"),
} as Parameters<typeof ForecastsTab>[0]["period"];

const order = (id: string, status: string, price: number): Order =>
    ({
        id, order_id: id, status, price, items: [], is_return: false,
        created_at: "2026-10-20T10:00:00.000Z", updated_at: "2026-10-28T10:00:00.000Z", delivered_at: status === "delivered" ? "2026-10-25T10:00:00.000Z" : null,
    }) as unknown as Order;

describe("ForecastsTab", () => {
    it("reads in Arabic with no English headings left", () => {
        render(<ForecastsTab orders={[order("a", "delivered", 50000), order("b", "in_transit", 30000)]} expenses={[]} period={period} />);
        expect(screen.getByText("توقّع المقبوضات")).toBeTruthy();
        expect(screen.getByText("تغطية المصروفات")).toBeTruthy();
        expect(screen.queryByText("Cash cover")).toBeNull();
        expect(screen.queryByText("Cash Runway")).toBeNull();
    });

    it("renders without orders or expenses", () => {
        render(<ForecastsTab orders={[]} expenses={[] as Expense[]} period={period} />);
        expect(screen.getByText("توقّع المقبوضات")).toBeTruthy();
    });
});
