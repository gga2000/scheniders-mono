import { describe, expect, it } from "vitest";
import { welcomePath } from "./welcome-path";

describe("welcomePath", () => {
    it("shows the basics and first order before any answer", () => {
        const path = welcomePath({ inShop: null, staff: null });
        expect(path.rows.map((r) => r.id)).toEqual(["basics", "first_order"]);
        expect(path.more).toBe(5);
    });

    it("adds the till for a shop and the team for staff", () => {
        const path = welcomePath({ inShop: true, staff: true });
        expect(path.rows.map((r) => r.id)).toEqual(["basics", "first_order", "team", "till"]);
        expect(path.rows.filter((r) => r.added).map((r) => r.id)).toEqual(["team", "till"]);
    });

    it("adds nothing for an online-only solo shop", () => {
        expect(welcomePath({ inShop: false, staff: false }).rows).toHaveLength(2);
    });
});
