import { describe, expect, it } from "vitest";
import { cardSpot, freeArea, type Rect } from "./card-spot";

// An iPad in landscape: 1180 x 740, the folded menu (72 wide at 16px), the
// pill's band 76px at the bottom, and the first product's card (360 x 356).
const VIEW = { width: 1180, height: 740 };
const MENU: Rect = { left: 16, top: 16, width: 72, height: 708 };
const CARD = { width: 360, height: 356 };
const area = freeArea(VIEW, 76, [MENU]);
const right = (spot: { left: number }): number => spot.left + CARD.width;

describe("freeArea", () => {
    it("starts past the menu that paints over the card", () => {
        expect(area).toEqual({ left: 104, top: 16, right: 1164, bottom: 664 });
    });

    it("ignores a menu that isn't shown", () => {
        expect(freeArea(VIEW, 76, [{ left: 0, top: 0, width: 0, height: 0 }]).left).toBe(16);
    });
});

describe("cardSpot", () => {
    it("never slides the card under the menu (Ali, 28 Nov: the price field on an iPad)", () => {
        // The price field sits near the menu: centring the card on it reached x=59.
        const price: Rect = { left: 131, top: 560, width: 215, height: 112 };
        const spot = cardSpot(price, CARD, area);
        expect(spot.left).toBeGreaterThanOrEqual(area.left);
        expect(spot.side).toBe("above");
    });

    it("keeps its side while the same field scrolls, instead of hopping above, beside and below", () => {
        let field: Rect = { left: 131, top: 575, width: 325, height: 142 };
        const sides: string[] = [];
        let keep = cardSpot(field, CARD, area).side;
        for (let top = 575; top >= 0; top -= 25) {
            field = { ...field, top };
            const spot = cardSpot(field, CARD, area, keep);
            keep = spot.side;
            if (sides[sides.length - 1] !== spot.side) sides.push(spot.side);
        }
        for (let top = 0; top <= 575; top += 25) {
            field = { ...field, top };
            const spot = cardSpot(field, CARD, area, keep);
            keep = spot.side;
            if (sides[sides.length - 1] !== spot.side) sides.push(spot.side);
        }
        expect(sides).toEqual(["above", "right"]);
    });

    it("hides as little of the field as it can when no side has room", () => {
        // A tall photo box filling most of a short screen, wide to the edge.
        const photo: Rect = { left: 131, top: 60, width: 1000, height: 560 };
        const spot = cardSpot(photo, CARD, area);
        expect(spot.left).toBeGreaterThanOrEqual(area.left);
        expect(right(spot)).toBeLessThanOrEqual(area.right);
        expect(spot.top + CARD.height).toBeLessThanOrEqual(area.bottom);
    });

    it("goes below a field with room under it", () => {
        const name: Rect = { left: 400, top: 120, width: 300, height: 70 };
        expect(cardSpot(name, CARD, area)).toEqual({ left: 370, top: 208, side: "below" });
    });
});
