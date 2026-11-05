import { describe, expect, it } from "vitest";
import { orderChecks, trustBand, trustOf, worstStep } from "./trust";
import type { ShieldNetwork } from "./types";

const row = (trust: number, steps: ShieldNetwork["trust_steps"], isNew = false): ShieldNetwork => ({
    phone: "7701234567", band: "none", score: null, confidence: null, stores: null, outcomes: null, delivered: null,
    delivered_stores: null, bad: null, sequence: null, last_bad_orders_ago: null, trend: null,
    trust, trust_new: isNew, trust_steps: steps,
});

describe("Shield trust", () => {
    it("bands: 80+ green, 50-79 yellow, under 50 red", () => {
        expect(trustBand(100)).toBe("green");
        expect(trustBand(80)).toBe("green");
        expect(trustBand(79)).toBe("yellow");
        expect(trustBand(50)).toBe("yellow");
        expect(trustBand(49)).toBe("red");
        expect(trustBand(0)).toBe("red");
    });

    it("reads no row as a new customer at 100", () => {
        expect(trustOf(null)).toEqual({ score: 100, isNew: true, band: "green", steps: [] });
        expect(trustOf(row(40, [{ src: "net", kind: "refused", pts: -35 }])).band).toBe("red");
    });

    it("names the step that cost the most, this store first on a tie", () => {
        expect(worstStep([
            { src: "net", kind: "no_answer", pts: -25 },
            { src: "own", kind: "no_answer", pts: -25 },
            { src: "own", kind: "delivered", pts: 15 },
        ])).toEqual({ src: "own", kind: "no_answer", pts: -25 });
        expect(worstStep([{ src: "own", kind: "delivered", pts: 0 }])).toBeNull();
    });

    it("warns about a wrong number, no address, or only the governorate", () => {
        expect(orderChecks({ phone: "07701234567", addressDetails: "الكرادة شارع 62 قرب مطعم" })).toEqual([]);
        expect(orderChecks({ phone: "0770", addressDetails: "الكرادة شارع 62" })).toEqual(["invalidPhone"]);
        expect(orderChecks({ phone: "07701234567", addressDetails: "  " })).toEqual(["noAddress"]);
        expect(orderChecks({ phone: "07701234567", addressDetails: "بغداد" })).toEqual(["governorateOnly"]);
        expect(orderChecks({ phone: "07701234567", addressDetails: "محافظة البصرة" })).toEqual(["governorateOnly"]);
        expect(orderChecks({ phone: "07701234567", addressDetails: "بصره" })).toEqual(["governorateOnly"]);
        expect(orderChecks({ phone: "07701234567", addressDetails: "الزبير", city: "الزبير" })).toEqual(["governorateOnly"]);
    });

    it("does not punish a short but real address", () => {
        expect(orderChecks({ phone: "07701234567", addressDetails: "حي الجامعة" })).toEqual([]);
    });
});
