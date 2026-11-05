import { describe, expect, it } from "vitest";
import { dangerBandOf, dangerCounts } from "./danger";

const o = (id: string, status = "new", is_return = false) => ({ id, status, is_return }) as Parameters<typeof dangerBandOf>[0];
const trust = new Map([["a", 10], ["b", 49], ["c", 50], ["d", 79]]);

describe("Shield danger bands", () => {
    it("under 50 high, 50-79 medium, the rest of the open orders low", () => {
        expect(dangerBandOf(o("a"), trust)).toBe("red");
        expect(dangerBandOf(o("b"), trust)).toBe("red");
        expect(dangerBandOf(o("c"), trust)).toBe("yellow");
        expect(dangerBandOf(o("d"), trust)).toBe("yellow");
        expect(dangerBandOf(o("e"), trust)).toBe("green");
    });

    it("orders that can no longer be stopped, and returns, have no band", () => {
        expect(dangerBandOf(o("a", "delivered"), trust)).toBeNull();
        expect(dangerBandOf(o("a", "new", true), trust)).toBeNull();
    });

    it("counts each band", () => {
        expect(dangerCounts([o("a"), o("c"), o("d"), o("e"), o("f", "in_transit")], trust)).toEqual({ red: 1, yellow: 2, green: 1 });
    });
});
