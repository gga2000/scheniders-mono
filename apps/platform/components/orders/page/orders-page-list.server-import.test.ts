// @vitest-environment node
import { describe, it, expect } from "vitest";

// The card list and the table are imported directly by the orders page (not
// through next/dynamic with ssr: false), so their whole module tree is now
// evaluated during server rendering. Nothing in it may touch the browser at
// import time.
describe("orders page list on the server", () => {
    it("imports the card list and the table without a browser", async () => {
        expect(typeof window).toBe("undefined");
        const list = await import("@/components/orders/virtualized-order-list");
        const table = await import("@/components/orders/virtualized-order-table");
        const page = await import("./orders-page-list");
        expect(list.VirtualizedOrderList).toBeTruthy();
        expect(table.VirtualizedOrderTable).toBeTruthy();
        expect(page).toBeTruthy();
    });
});
