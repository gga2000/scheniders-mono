import { describe, expect, it } from "vitest";
import { buildPickList, getQueueFlags, hasBlockingFlag, sortQueue } from "./dispatch-queue";

const NOW = new Date("2026-10-31T09:00:00Z").getTime();
const base = { print_count: 0, scheduled_date: null, phone: "07701234567", address_details: "Street 4", city: "Baghdad" };

describe("getQueueFlags", () => {
    it("flags nothing for a complete, unprinted, unscheduled order", () => {
        const flags = getQueueFlags(base, NOW);
        expect(flags).toEqual({ reprint: false, scheduledLater: false, missingPhone: false, missingAddress: false });
        expect(hasBlockingFlag(flags)).toBe(false);
    });

    it("flags reprints, later schedules and missing contact data", () => {
        const flags = getQueueFlags(
            { ...base, print_count: 2, scheduled_date: "2026-11-05", phone: " ", city: "" },
            NOW,
        );
        expect(flags.reprint).toBe(true);
        expect(flags.scheduledLater).toBe(true);
        expect(flags.missingPhone).toBe(true);
        expect(flags.missingAddress).toBe(true);
        expect(hasBlockingFlag(flags)).toBe(true);
    });

    it("does not treat an order scheduled for today as later", () => {
        expect(getQueueFlags({ ...base, scheduled_date: "2026-10-31" }, NOW).scheduledLater).toBe(false);
    });
});

describe("buildPickList", () => {
    const item = (name: string, quantity: number, extra: Record<string, unknown> = {}) => ({ name, quantity, price: 1000, ...extra });

    it("sums units across orders and counts orders per line", () => {
        const list = buildPickList([
            { items: [item("Fusion", 2, { product_id: "p1" }), item("Oud", 1, { product_id: "p2" })] },
            { items: [item("Fusion", 1, { product_id: "p1" })] },
        ]);
        expect(list).toEqual([
            { key: "p1||new", name: "Fusion", quantity: 3, orderCount: 2 },
            { key: "p2||new", name: "Oud", quantity: 1, orderCount: 1 },
        ]);
    });

    it("keeps open-box and new stock on separate lines", () => {
        const list = buildPickList([{ items: [item("Fusion", 1, { product_id: "p1" }), item("Fusion", 1, { product_id: "p1", is_open_box: true })] }]);
        expect(list).toHaveLength(2);
    });

    it("merges per-unit lines of the same product", () => {
        const list = buildPickList([{ items: [item("Fusion", 1, { product_id: "p1" }), item("Fusion", 1, { product_id: "p1" })] }]);
        expect(list).toEqual([{ key: "p1||new", name: "Fusion", quantity: 2, orderCount: 1 }]);
    });
});

describe("sortQueue", () => {
    const row = (id: string, o: Partial<{ priority: "urgent" | "high" | "normal"; created_at: string; city: string; price: number }>) => ({
        id,
        priority: "normal" as const,
        created_at: "2026-10-31T08:00:00Z",
        city: "Basra",
        price: 10000,
        ...o,
    });

    it("puts urgent before high before normal and keeps ties in input order", () => {
        const sorted = sortQueue(
            [row("a", {}), row("b", { priority: "urgent" }), row("c", { priority: "high" }), row("d", {})],
            "priority"
        );
        expect(sorted.map((o) => o.id)).toEqual(["b", "c", "a", "d"]);
    });

    it("sorts oldest first by date, by city name, and cheapest first by price", () => {
        const rows = [
            row("a", { created_at: "2026-10-31T09:00:00Z", city: "Mosul", price: 30000 }),
            row("b", { created_at: "2026-10-31T07:00:00Z", city: "Erbil", price: 10000 }),
        ];
        expect(sortQueue(rows, "date").map((o) => o.id)).toEqual(["b", "a"]);
        expect(sortQueue(rows, "city").map((o) => o.id)).toEqual(["b", "a"]);
        expect(sortQueue(rows, "price").map((o) => o.id)).toEqual(["b", "a"]);
    });

    it("does not mutate its input", () => {
        const rows = [row("a", { priority: "normal" }), row("b", { priority: "urgent" })];
        sortQueue(rows, "priority");
        expect(rows.map((o) => o.id)).toEqual(["a", "b"]);
    });
});
