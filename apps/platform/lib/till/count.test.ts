import { describe, expect, it } from "vitest";
import type { TillProduct } from "./cart";
import { countLines, isBigDrop, summarizeCount, type CountLine } from "./count";

const sized: TillProduct = {
    id: "p1",
    name: "Envoy",
    price: 45_000,
    image_url: null,
    tag_color: null,
    barcode: null,
    sku: null,
    available: 18,
    on_hand: 21,
    low_at: 5,
    notes: [],
    variants: [
        { id: "v30", name: "30 ml", price: 10_000, barcode: "11130", sku: null, available: 4, on_hand: 5 },
        { id: "v100", name: "100 ml", price: 45_000, barcode: "111100", sku: null, available: 14, on_hand: 16 },
    ],
};
const bag: TillProduct = { id: "p2", name: "Gift bag", price: 2_000, image_url: null, tag_color: null, barcode: "222", sku: null, available: 40, on_hand: 40, low_at: 5, notes: [], variants: [] };

describe("countLines", () => {
    it("gives one line per size, counting bottles held by orders too", () => {
        const lines = countLines([sized, bag]);
        expect(lines.map((l) => [l.key, l.variant_name, l.expected])).toEqual([
            ["p1:v30", "30 ml", 5],
            ["p1:v100", "100 ml", 16],
            ["p2", null, 40],
        ]);
    });
});

describe("summarizeCount", () => {
    const lines = countLines([sized, bag]);

    it("leaves lines nobody counted alone", () => {
        const s = summarizeCount(lines, new Map([["p1:v30", 3]]), false);
        expect(s).toMatchObject({ scanned: 3, notCounted: 2, missing: 2, extra: 0 });
        expect(s.changes.map((c) => [c.line.key, c.counted, c.diff])).toEqual([["p1:v30", 3, -2]]);
    });

    it("counts extra bottles and ignores lines that match", () => {
        const s = summarizeCount(lines, new Map([["p1:v100", 18], ["p2", 40]]), false);
        expect(s).toMatchObject({ scanned: 58, notCounted: 1, missing: 0, extra: 2 });
        expect(s.changes).toHaveLength(1);
    });

    it("treats uncounted lines as gone when the whole shelf was counted", () => {
        const s = summarizeCount(lines, new Map([["p1:v100", 16]]), true);
        expect(s.changes.map((c) => [c.line.key, c.counted])).toEqual([["p1:v30", 0], ["p2", 0]]);
        expect(s.missing).toBe(45);
    });
});

describe("isBigDrop", () => {
    const line = (expected: number): CountLine => ({ key: "k", product_id: "p", variant_id: null, name: "n", variant_name: null, image_url: null, expected });
    it("flags a drop of 10+ that is at least half the stock", () => {
        expect(isBigDrop({ line: line(53), counted: 1, diff: -52 })).toBe(true);
        expect(isBigDrop({ line: line(20), counted: 10, diff: -10 })).toBe(true);
    });
    it("leaves small or partial losses alone", () => {
        expect(isBigDrop({ line: line(12), counted: 3, diff: -9 })).toBe(false);
        expect(isBigDrop({ line: line(50), counted: 30, diff: -20 })).toBe(false);
        expect(isBigDrop({ line: line(2), counted: 30, diff: 28 })).toBe(false);
    });
});
