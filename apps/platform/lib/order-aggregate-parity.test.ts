import { describe, it, expect } from "vitest";
import { findAggregateMismatches } from "./order-aggregate-parity";

describe("findAggregateMismatches", () => {
    it("reports nothing when both sides agree", () => {
        expect(findAggregateMismatches({ all: 10, new: 4 }, { all: 10, new: 4 })).toEqual([]);
    });

    it("reports the keys that disagree, with both values", () => {
        // The failure this exists to catch: the server describing the filter
        // while the client describes only the loaded window.
        expect(findAggregateMismatches({ all: 12, new: 4 }, { all: 300, new: 4 }))
            .toEqual([{ key: "all", client: 12, server: 300 }]);
    });

    it("ignores keys the server does not return", () => {
        expect(findAggregateMismatches({ all: 10, peakHourOnly: 3 }, { all: 10 })).toEqual([]);
    });

    it("ignores non-numeric values rather than reporting false drift", () => {
        expect(findAggregateMismatches(
            { all: 10, label: "x" } as unknown as Record<string, number>,
            { all: 10, label: "y" } as unknown as Record<string, number>,
        )).toEqual([]);
    });

    it("is silent when either side is missing (still loading)", () => {
        expect(findAggregateMismatches(undefined, { all: 1 })).toEqual([]);
        expect(findAggregateMismatches({ all: 1 }, undefined)).toEqual([]);
    });
});
