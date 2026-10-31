/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { buildStockToday, type StockTodayRow } from "@/lib/orders/stock-today";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        t: (key: string, _f?: unknown, vars?: Record<string, string | number>) =>
            vars ? `${key} ${Object.values(vars).join(" ")}` : key,
        language: "en",
    }),
}));

vi.mock("@/components/products/product-thumb", () => ({ ProductThumb: () => null }));

let rows: StockTodayRow[] = [];
vi.mock("@/hooks/use-stock-today-query", () => ({
    useStockTodayQuery: () => ({
        data: buildStockToday(rows),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        dataUpdatedAt: Date.UTC(2026, 9, 30, 14, 0),
    }),
}));

let pinKeys: string[] = [];
let canEditPins = true;
const togglePin = vi.fn();
vi.mock("@/hooks/use-stock-pins", async () => {
    const { resolveStockPins } = await import("@/lib/orders/stock-pins");
    return {
        useStockPins: (items: Parameters<typeof resolveStockPins>[0]) => ({
            pinned: resolveStockPins(items, pinKeys),
            canEdit: canEditPins,
            isFull: pinKeys.length >= 3,
            toggle: togglePin,
            move: vi.fn(),
        }),
    };
});

import { StockTodayDialog } from "./stock-today-dialog";

function row(i: number, over: Partial<StockTodayRow> = {}): StockTodayRow {
    return {
        product_id: `p${i}`, variant_id: null as unknown as string, name: `Product ${i}`, short_name: null, variant_name: null as unknown as string,
        sku: `SKU-${i}`, image_url: null as unknown as string, is_filler: false, low_stock_threshold: 5,
        on_hand: 50, reserved: 0, ob_left: 0, ob_reserved: 0,
        today_new: 0, today_ob: 0, waiting_new: 0, waiting_ob: 0,
        ...over,
    };
}

afterEach(() => { cleanup(); rows = []; pinKeys = []; canEditPins = true; togglePin.mockClear(); window.localStorage.clear(); });

describe("StockTodayDialog, simple view", () => {
    it("opens on the simple board: six cards, worst first, minus sign when oversold", () => {
        rows = [
            ...Array.from({ length: 8 }, (_, i) => row(i)),
            row(99, { name: "Perciveron", on_hand: -84, reserved: 10 }),
            row(98, { name: "Fusion", on_hand: 3, reserved: 0, ob_left: 1, today_new: 2 }),
        ];
        render(<StockTodayDialog open onOpenChange={vi.fn()} />);

        const cards = () => screen.getAllByRole("listitem");
        expect(cards()).toHaveLength(6);
        expect(cards()[0].textContent).toContain("Perciveron");
        expect(cards()[0].textContent).toContain("−94");
        const fusion = cards().find(c => c.textContent?.includes("Fusion"));
        expect(fusion?.textContent).toContain("orders.stockToday.openBox");
        expect(fusion?.textContent).toContain("orders.stockToday.glance.today 2");

        fireEvent.click(screen.getByText(/orders\.stockToday\.showAll/));
        expect(cards()).toHaveLength(10);
    });

    it("remembers the detailed view", () => {
        rows = [row(1)];
        render(<StockTodayDialog open onOpenChange={vi.fn()} />);
        fireEvent.click(screen.getByText("orders.stockToday.view.detailed"));
        expect(window.localStorage.getItem("stock-today-view")).toBe("detailed");
        expect(screen.getByText("orders.stockToday.todayUnits")).toBeDefined();
    });
});

describe("StockTodayDialog, detailed view", () => {
    beforeEach(() => { window.localStorage.setItem("stock-today-view", "detailed"); });

    it("lists five, then five more, then all; oversold first", () => {
        rows = [
            ...Array.from({ length: 12 }, (_, i) => row(i)),
            row(99, { name: "Perciveron", on_hand: -84, reserved: 10 }),
        ];
        render(<StockTodayDialog open onOpenChange={vi.fn()} />);

        const names = () => screen.getAllByRole("listitem").map(li => li.textContent ?? "");
        expect(names()).toHaveLength(5);
        expect(names()[0]).toContain("Perciveron");
        expect(names()[0]).toContain("94");
        expect(screen.getByText(/orders\.stockToday\.recount/)).toBeDefined();

        fireEvent.click(screen.getByText(/orders\.stockToday\.more/));
        expect(names()).toHaveLength(10);

        fireEvent.click(screen.getByText(/orders\.stockToday\.showAll/));
        expect(names()).toHaveLength(13);
        expect(screen.getByText("orders.stockToday.fewer")).toBeDefined();
    });

    it("filters to oversold from its tile and warns about waiting orders", () => {
        rows = [
            row(1, { name: "Fusion", on_hand: 3, reserved: 1, waiting_new: 4 }),
            row(2, { name: "Envoy", on_hand: -1, reserved: 0 }),
            row(3, { name: "Tobacco" }),
        ];
        render(<StockTodayDialog open onOpenChange={vi.fn()} />);

        expect(screen.getByText("orders.stockToday.ifConfirmOver 4 2")).toBeDefined();
        fireEvent.click(screen.getByText("orders.stockToday.oversold").closest("button") as HTMLElement);
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(1);
        expect(items[0].textContent).toContain("Envoy");
    });
});

describe("StockTodayDialog, pinned products", () => {
    it("shows pinned products first, in pin order, ahead of worse-off ones", () => {
        rows = [
            row(1, { name: "Fine A" }),
            row(2, { name: "Oversold B", on_hand: -3 }),
            row(3, { name: "Fine C" }),
        ];
        pinKeys = ["p3", "p1"];
        render(<StockTodayDialog open onOpenChange={vi.fn()} />);
        const names = screen.getAllByRole("listitem").map(li => li.textContent ?? "");
        expect(names[0]).toContain("Fine C");
        expect(names[1]).toContain("Fine A");
        expect(names[2]).toContain("Oversold B");
    });

    it("lets an admin pin and unpin, and stops at three", () => {
        rows = [row(1), row(2), row(3), row(4)];
        pinKeys = ["p1", "p2", "p3"];
        render(<StockTodayDialog open onOpenChange={vi.fn()} />);
        fireEvent.click(screen.getAllByRole("button", { name: "orders.stockToday.pin.unpin" })[0]);
        expect(togglePin).toHaveBeenCalledWith("p1");
        const pinButtons = screen.getAllByRole("button", { name: "orders.stockToday.pin.pin" });
        expect(pinButtons).toHaveLength(1);
        expect((pinButtons[0] as HTMLButtonElement).disabled).toBe(true);
    });

    it("shows team members who cannot edit a mark instead of buttons", () => {
        rows = [row(1), row(2)];
        pinKeys = ["p1"];
        canEditPins = false;
        render(<StockTodayDialog open onOpenChange={vi.fn()} />);
        expect(screen.queryAllByRole("button", { name: /orders\.stockToday\.pin\./ })).toHaveLength(0);
        expect(screen.getAllByTitle("orders.stockToday.pin.pinned")).toHaveLength(1);
    });
});
