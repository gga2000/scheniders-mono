import { describe, expect, it } from "vitest";
import { deliveryRatePct } from "./delivery-rate";

describe("deliveryRatePct", () => {
    it("is delivered over delivered plus rejected", () => {
        expect(deliveryRatePct(95, 5)).toBe(95);
    });
    it("is null when nothing was decided yet", () => {
        expect(deliveryRatePct(0, 0)).toBeNull();
    });
    it("is 0 when every decided parcel was refused", () => {
        expect(deliveryRatePct(0, 3)).toBe(0);
    });
});
