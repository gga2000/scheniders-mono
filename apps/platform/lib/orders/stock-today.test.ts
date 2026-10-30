import { describe, expect, it } from "vitest";
import { buildStockToday, filterStockToday, laneState, stockTodaySummary, type StockTodayRow } from "./stock-today";

function row(over: Partial<StockTodayRow>): StockTodayRow {
    return {
        product_id: "p1", variant_id: null as unknown as string, name: "Envoy", variant_name: null as unknown as string,
        sku: "envoy", image_url: null as unknown as string, is_filler: false, low_stock_threshold: 5,
        on_hand: 0, reserved: 0, ob_left: 0, ob_reserved: 0,
        today_new: 0, today_ob: 0, waiting_new: 0, waiting_ob: 0,
        ...over,
    };
}

describe("laneState", () => {
    const lane = (left: number, waiting = 0) => ({ onHand: left, reserved: 0, left, today: 0, waiting });
    it("orders oversold, short, out, low, ok", () => {
        expect(laneState(lane(-1), 5)).toBe("oversold");
        expect(laneState(lane(2, 3), 5)).toBe("short");
        expect(laneState(lane(0), 5)).toBe("out");
        expect(laneState(lane(5), 5)).toBe("low");
        expect(laneState(lane(6), 5)).toBe("ok");
    });
});

describe("buildStockToday", () => {
    it("left is on hand minus confirmed; waiting holds nothing", () => {
        const [it] = buildStockToday([row({ on_hand: 202, reserved: 17, today_new: 18, waiting_new: 1 })]);
        expect(it.fresh).toEqual({ onHand: 202, reserved: 17, left: 185, today: 18, waiting: 1 });
        expect(it.state).toBe("ok");
        expect(it.openBox).toBeNull();
    });

    it("negative shelf count is oversold by the shelf deficit plus what is reserved", () => {
        const [it] = buildStockToday([row({ on_hand: -84, reserved: 10 })]);
        expect(it.fresh.left).toBe(-94);
        expect(it.state).toBe("oversold");
    });

    it("open box: open_box_quantity is already what is left; shelf adds back the reserved", () => {
        const [it] = buildStockToday([row({ on_hand: 50, ob_left: 1, ob_reserved: 2, today_ob: 2 })]);
        expect(it.openBox).toEqual({ onHand: 3, reserved: 2, left: 1, today: 2, waiting: 0 });
        expect(it.state).toBe("low");
    });

    it("row takes the worse of its two lanes", () => {
        const [it] = buildStockToday([row({ on_hand: 50, ob_left: 1, waiting_ob: 2 })]);
        expect(it.state).toBe("short");
    });

    it("drops fillers and idle parent rows of products with variants", () => {
        const items = buildStockToday([
            row({ product_id: "f", is_filler: true, on_hand: -3 }),
            row({ product_id: "v" }),
            row({ product_id: "v", variant_id: "v1", variant_name: "50ml", on_hand: 4 }),
        ]);
        expect(items.map(i => i.key)).toEqual(["v1"]);
    });

    it("sorts worst first, then by today's demand", () => {
        const items = buildStockToday([
            row({ product_id: "a", name: "A", on_hand: 50, today_new: 1 }),
            row({ product_id: "b", name: "B", on_hand: 50, today_new: 9 }),
            row({ product_id: "c", name: "C", on_hand: -5, reserved: 7 }),
        ]);
        expect(items.map(i => i.productId)).toEqual(["c", "b", "a"]);
    });
});

describe("filters and summary", () => {
    const items = buildStockToday([
        row({ product_id: "a", name: "Fusion", sku: "SCHN-FUSION", on_hand: -5, reserved: 10, today_new: 13, ob_left: 20 }),
        row({ product_id: "b", name: "Identity", on_hand: 3 }),
        row({ product_id: "c", name: "Tobacco", on_hand: 50 }),
    ]);

    it("filters by state, lane and search", () => {
        expect(filterStockToday(items, "oversold", "both", "").map(i => i.productId)).toEqual(["a"]);
        expect(filterStockToday(items, "attention", "both", "").map(i => i.productId)).toEqual(["a", "b"]);
        expect(filterStockToday(items, "today", "both", "").map(i => i.productId)).toEqual(["a"]);
        expect(filterStockToday(items, "all", "openBox", "").map(i => i.productId)).toEqual(["a"]);
        expect(filterStockToday(items, "all", "both", "fusion").map(i => i.productId)).toEqual(["a"]);
    });

    it("counts", () => {
        expect(stockTodaySummary(items)).toEqual({ all: 3, oversold: 1, attention: 2, todayUnits: 13 });
    });
});
