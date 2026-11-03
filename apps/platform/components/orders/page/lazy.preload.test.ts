import { describe, it, expect, vi, beforeEach } from "vitest";

const loaded = vi.hoisted(() => ({ list: 0, table: 0 }));

vi.mock("@/components/orders/virtualized-order-list", () => {
    loaded.list++;
    return { VirtualizedOrderList: () => null };
});
vi.mock("@/components/orders/virtualized-order-table", () => {
    loaded.table++;
    return { VirtualizedOrderTable: () => null };
});

describe("preloadOrdersView", () => {
    beforeEach(() => {
        vi.resetModules();
        loaded.list = 0;
        loaded.table = 0;
    });

    it("starts loading the card list for the card views, before any row renders", async () => {
        const { preloadOrdersView } = await import("./lazy");
        preloadOrdersView("list");
        await vi.waitFor(() => expect(loaded.list).toBe(1));
        expect(loaded.table).toBe(0);
    });

    it("starts loading the table for the table view only", async () => {
        const { preloadOrdersView } = await import("./lazy");
        preloadOrdersView("table");
        await vi.waitFor(() => expect(loaded.table).toBe(1));
        expect(loaded.list).toBe(0);
    });

    it("loads neither for the kanban view", async () => {
        const { preloadOrdersView } = await import("./lazy");
        preloadOrdersView("kanban");
        await new Promise((r) => setTimeout(r, 10));
        expect(loaded).toEqual({ list: 0, table: 0 });
    });
});
