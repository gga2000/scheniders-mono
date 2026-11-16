import { describe, expect, it } from "vitest";
import { wheelToSideways } from "./use-wheel-scrolls-sideways";

const wheel = (deltaY: number, over: Partial<{ deltaX: number; deltaMode: number; shiftKey: boolean; ctrlKey: boolean }> = {}) => ({
    deltaX: 0, deltaMode: 0, shiftKey: false, ctrlKey: false, deltaY, ...over,
});
// The Orders chip row at 1440: 3,473 px of chips in 1,240 px.
const row = (scrollLeft: number) => ({ scrollLeft, clientWidth: 1240, scrollWidth: 3473 });

describe("wheelToSideways", () => {
    it("moves the row right on wheel down and left on wheel up", () => {
        expect(wheelToSideways(wheel(100), row(0))).toBe(100);
        expect(wheelToSideways(wheel(-100), row(300))).toBe(200);
    });

    it("stops at the row's ends without overshooting", () => {
        expect(wheelToSideways(wheel(500), row(2000))).toBe(2233);
        expect(wheelToSideways(wheel(-500), row(100))).toBe(0);
    });

    it("gives the wheel back to the page at either end, so the page still scrolls", () => {
        expect(wheelToSideways(wheel(100), row(2233))).toBeNull();
        expect(wheelToSideways(wheel(-100), row(0))).toBeNull();
    });

    it("leaves trackpad, shift+wheel and ctrl+wheel (zoom) alone", () => {
        expect(wheelToSideways(wheel(10, { deltaX: 40 }), row(0))).toBeNull();
        expect(wheelToSideways(wheel(100, { shiftKey: true }), row(0))).toBeNull();
        expect(wheelToSideways(wheel(100, { ctrlKey: true }), row(0))).toBeNull();
    });

    it("does nothing when every chip already fits", () => {
        expect(wheelToSideways(wheel(100), { scrollLeft: 0, clientWidth: 1240, scrollWidth: 1240 })).toBeNull();
    });

    it("turns line and page wheel steps into pixels", () => {
        expect(wheelToSideways(wheel(3, { deltaMode: 1 }), row(0))).toBe(48);
        expect(wheelToSideways(wheel(1, { deltaMode: 2 }), row(0))).toBe(1240);
    });
});
