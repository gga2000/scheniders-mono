import { describe, expect, it } from "vitest";
import { dangerBandOf, dangerCounts, inDangerRange, snapDanger } from "./danger";

const o = (id: string, status = "new", is_return = false) => ({ id, status, is_return }) as Parameters<typeof inDangerRange>[0];
const trust = new Map([["a", 10], ["b", 49], ["c", 75]]);

describe("Shield danger slider", () => {
    it("100 is off: every order stays", () => {
        expect(inDangerRange(o("z", "delivered"), trust, 100)).toBe(true);
    });

    it("keeps open orders at or under the picked score", () => {
        expect(inDangerRange(o("a"), trust, 49)).toBe(true);
        expect(inDangerRange(o("b"), trust, 49)).toBe(true);
        expect(inDangerRange(o("c"), trust, 49)).toBe(false);
        expect(inDangerRange(o("z"), trust, 80)).toBe(false);
    });

    it("drops orders that can no longer be stopped, and returns", () => {
        expect(inDangerRange(o("a", "delivered"), trust, 49)).toBe(false);
        expect(inDangerRange(o("a", "new", true), trust, 49)).toBe(false);
    });

    it("snaps to steps of 5 up to 80, then off", () => {
        expect(snapDanger(47)).toBe(45);
        expect(snapDanger(80)).toBe(80);
        expect(snapDanger(83)).toBe(100);
    });
});

describe("Shield danger bands", () => {
    const tr = new Map([["a", 10], ["b", 49], ["c", 50], ["d", 79]]);
    it("under 50 high, 50-79 medium, the rest of the open orders low; closed orders none", () => {
        expect(dangerBandOf(o("a"), tr)).toBe("red");
        expect(dangerBandOf(o("b"), tr)).toBe("red");
        expect(dangerBandOf(o("c"), tr)).toBe("yellow");
        expect(dangerBandOf(o("d"), tr)).toBe("yellow");
        expect(dangerBandOf(o("e"), tr)).toBe("green");
        expect(dangerBandOf(o("a", "delivered"), tr)).toBeNull();
    });

    it("counts each band", () => {
        expect(dangerCounts([o("a"), o("c"), o("d"), o("e"), o("f", "in_transit")], tr)).toEqual({ red: 1, yellow: 2, green: 1 });
    });
});
