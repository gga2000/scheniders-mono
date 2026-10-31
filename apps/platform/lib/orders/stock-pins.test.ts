import { describe, expect, it } from "vitest";
import { buildStockToday, type StockTodayRow } from "./stock-today";
import { MAX_STOCK_PINS, movePin, parseStockPins, pinnedFirst, resolveStockPins, togglePin } from "./stock-pins";

function row(id: string, today: number, over: Partial<StockTodayRow> = {}): StockTodayRow {
    return {
        product_id: id, variant_id: null as unknown as string, name: id, short_name: null, variant_name: null as unknown as string,
        sku: null as unknown as string, image_url: null as unknown as string, is_filler: false, low_stock_threshold: 5,
        on_hand: 50, reserved: 0, ob_left: 0, ob_reserved: 0, today_new: today, today_ob: 0, waiting_new: 0, waiting_ob: 0,
        ...over,
    };
}

const items = buildStockToday([row("a", 1), row("b", 9), row("c", 0), row("d", 4), row("e", 2)]);

describe("parseStockPins", () => {
    it("reads a saved list and treats anything else as not chosen", () => {
        expect(parseStockPins({ keys: ["a", "b"] })).toEqual(["a", "b"]);
        expect(parseStockPins({ keys: [] })).toEqual([]);
        expect(parseStockPins(undefined)).toBeNull();
        expect(parseStockPins({ keys: ["a", "b", "c", "d"] })).toBeNull();
        expect(parseStockPins({ keys: [""] })).toBeNull();
    });
});

describe("resolveStockPins", () => {
    it("defaults to the three most ordered today, none that sold nothing", () => {
        expect(resolveStockPins(items, null).map(i => i.key)).toEqual(["b", "d", "e"]);
        expect(resolveStockPins(buildStockToday([row("z", 0)]), null)).toEqual([]);
    });

    it("keeps the saved order and drops products that are gone", () => {
        expect(resolveStockPins(items, ["e", "gone", "a"]).map(i => i.key)).toEqual(["e", "a"]);
    });

    it("an empty saved list pins nothing", () => {
        expect(resolveStockPins(items, [])).toEqual([]);
    });
});

describe("pinnedFirst", () => {
    it("puts pins first in pin order and leaves the rest as they were", () => {
        const pinned = resolveStockPins(items, ["e", "a"]);
        const rest = items.filter(i => i.key !== "e" && i.key !== "a").map(i => i.key);
        expect(pinnedFirst(items, pinned).map(i => i.key)).toEqual(["e", "a", ...rest]);
    });
});

describe("togglePin and movePin", () => {
    it("pins at the end, unpins, and stops at the limit", () => {
        expect(togglePin(["a"], "b")).toEqual(["a", "b"]);
        expect(togglePin(["a", "b"], "a")).toEqual(["b"]);
        const full = ["a", "b", "c"].slice(0, MAX_STOCK_PINS);
        expect(togglePin(full, "d")).toEqual(full);
    });

    it("moves one place and ignores the ends", () => {
        expect(movePin(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
        expect(movePin(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
        expect(movePin(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
        expect(movePin(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    });
});
