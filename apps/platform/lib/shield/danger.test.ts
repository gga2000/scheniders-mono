import { describe, expect, it } from "vitest";
import { inDangerRange, snapDanger } from "./danger";

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
