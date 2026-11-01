import { describe, expect, it } from "vitest";
import { foldTail, seriesColor, OTHER_COLOR, SERIES_COLORS } from "./chart-categories";

describe("foldTail", () => {
    const merge = (tail: number[]) => tail.reduce((a, b) => a + b, 0);
    it("folds everything past `keep` into one row", () => {
        expect(foldTail([9, 8, 7, 6, 5, 4, 3], 5, merge)).toEqual([9, 8, 7, 6, 5, 7]);
    });
    it("leaves a list alone when only one row would fold", () => {
        expect(foldTail([9, 8, 7, 6, 5, 4], 5, merge)).toEqual([9, 8, 7, 6, 5, 4]);
    });
});

describe("seriesColor", () => {
    it("uses fixed slots and a neutral Other, never a wrapped hue", () => {
        expect(seriesColor(0, 6, true)).toBe(SERIES_COLORS[0]);
        expect(seriesColor(5, 6, true)).toBe(OTHER_COLOR);
    });
});
