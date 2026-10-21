import { describe, it, expect } from "vitest";
import type { Order } from "@/lib/supabase";
import { sortDesktopList, sortMobileList, sortPinnedNewestFirst } from "@/lib/orders/list-sort";

const NOW = Date.parse("2026-10-20T09:00:00.000Z");
const o = (id: string, at: string, extra: Partial<Order> = {}) =>
    ({ id, created_at: at, status: "new", items: [], ...extra }) as unknown as Order;
const ids = (rows: Order[]) => rows.map((r) => r.id);

const rows = () => [
    o("old", "2026-10-01T10:00:00.000Z", { price: 30, sequence_number: 3 }),
    o("parked", "2026-10-19T10:00:00.000Z", { scheduled_date: "2026-10-24", price: 10, sequence_number: 1 }),
    o("pinned", "2026-09-01T10:00:00.000Z", { is_pinned: true, price: 20, sequence_number: 9 }),
    o("new", "2026-10-20T08:00:00.000Z", { price: 10, sequence_number: 2 }),
    o("due", "2026-10-02T10:00:00.000Z", { scheduled_date: "2026-10-20", price: 5, sequence_number: 4 }),
];

describe("list sorts", () => {
    it("the hook: pinned first, then newest first", () => {
        expect(ids(sortPinnedNewestFirst(rows()))).toEqual(["pinned", "new", "parked", "due", "old"]);
    });

    it("desktop default: pinned first, parked last (a row due today is live), then newest first", () => {
        expect(ids(sortDesktopList(rows(), [], NOW))).toEqual(["pinned", "new", "due", "old", "parked"]);
    });

    it("desktop column sorts apply inside the pinned / parked bands, ties keep their incoming order", () => {
        expect(ids(sortDesktopList(rows(), [{ key: "amount", direction: "asc" }], NOW))).toEqual(["pinned", "due", "new", "old", "parked"]);
        expect(ids(sortDesktopList(rows(), [{ key: "order_id", direction: "desc" }], NOW))).toEqual(["pinned", "due", "old", "new", "parked"]);
    });

    it("mobile: parked last, newest first, the pin is not a key", () => {
        expect(ids(sortMobileList(rows(), NOW))).toEqual(["new", "due", "old", "pinned", "parked"]);
    });
});
