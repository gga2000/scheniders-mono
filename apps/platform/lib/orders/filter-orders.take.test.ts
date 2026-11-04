import { describe, expect, it } from "vitest";
import { filterOrders } from "./filter-orders";
import { countOrderChips } from "./order-chips";
import type { Order } from "@/types/order";

const row = (id: string, extra: Partial<Order>): Order =>
    ({ id, order_id: id, status: "completed", is_return: false, is_replacement: false, ...extra }) as Order;

describe("stock taken in person", () => {
    const rows = [row("sale", {}), row("take", { take_kind: "friend", taken_by: "Ali" })];

    it("stays out of the list and every chip count by default", () => {
        const visible = filterOrders(rows, { status: "all" });
        expect(visible.map((o) => o.id)).toEqual(["sale"]);
        expect(countOrderChips(visible).completed).toBe(1);
    });

    it("shows only takes under the Taken filter", () => {
        expect(filterOrders(rows, { orderType: "take" }).map((o) => o.id)).toEqual(["take"]);
    });
});
