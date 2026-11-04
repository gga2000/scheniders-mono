import { describe, expect, it } from "vitest";
import { primeHomeSummary, type PrimeHomeGroup } from "./home";

/** 2026-11-04 12:00 in Baghdad. */
const NOW = Date.parse("2026-11-04T09:00:00Z");

const group = (over: Partial<PrimeHomeGroup> = {}): PrimeHomeGroup => ({
    shipmentStatus: "ONWAY",
    stepCode: "ONWAY",
    cancelled: false,
    paid: false,
    orderOpen: true,
    sentDay: "2026-11-03",
    changedDay: "2026-11-04",
    parcels: 1,
    collect: 30_000,
    fees: 5_000,
    ...over,
});

const delivered = (over: Partial<PrimeHomeGroup> = {}) => group({ shipmentStatus: "DELIVERED", stepCode: "DLEIVERD", orderOpen: false, ...over });
const returning = (over: Partial<PrimeHomeGroup> = {}) => group({ shipmentStatus: "FAILED_DELIVER_RETURNED_TO_SENDER", stepCode: "RTN_INSTORE", ...over });

describe("primeHomeSummary", () => {
    it("holds the cash of delivered parcels Prime has not paid yet, net of its fees", () => {
        const s = primeHomeSummary(
            [
                delivered({ parcels: 3, collect: 90_000, fees: 15_000 }),
                delivered({ paid: true, parcels: 2, collect: 60_000, fees: 10_000 }),
                group({ parcels: 4, collect: 120_000, fees: 20_000 }),
            ],
            NOW,
        );
        expect(s.owed).toEqual({ cash: 75_000, parcels: 3 });
    });

    it("splits this month's parcels into paid, at Prime and on the way, and adds their fees", () => {
        const s = primeHomeSummary(
            [
                delivered({ paid: true, sentDay: "2026-11-01", collect: 40_000, fees: 5_000 }),
                delivered({ sentDay: "2026-11-02", collect: 30_000, fees: 5_000 }),
                group({ sentDay: "2026-11-04", collect: 20_000, fees: 6_000 }),
                // Coming back: its fee counts, its cash never arrives.
                returning({ sentDay: "2026-11-02", collect: 50_000, fees: 5_000 }),
                // Cancelled at Prime: neither.
                group({ cancelled: true, sentDay: "2026-11-03", collect: 99_000, fees: 9_000 }),
                // Last month: not this month's.
                delivered({ sentDay: "2026-10-31", collect: 25_000, fees: 5_000 }),
            ],
            NOW,
        );
        expect(s.month).toEqual({ fees: 21_000, paid: 35_000, atPrime: 25_000, onRoad: 14_000 });
        // Last month's unpaid parcel is still owed.
        expect(s.owed).toEqual({ cash: 45_000, parcels: 2 });
    });

    it("reads the delivery rate per Baghdad day from the parcels Prime finished", () => {
        const s = primeHomeSummary(
            [
                delivered({ changedDay: "2026-11-04", parcels: 9 }),
                returning({ changedDay: "2026-11-04", parcels: 1 }),
                delivered({ changedDay: "2026-11-02", parcels: 3 }),
                returning({ changedDay: "2026-11-02", parcels: 1 }),
                // Still on the way: not finished, not counted.
                group({ changedDay: "2026-11-04", parcels: 50 }),
                // The week before.
                delivered({ changedDay: "2026-10-27", parcels: 4 }),
                returning({ changedDay: "2026-10-27", parcels: 1 }),
            ],
            NOW,
        );
        expect(s.days.map((d) => d.day)).toEqual(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
        expect(s.days[6]).toEqual({ day: "2026-11-04", delivered: 9, returned: 1, rate: 90 });
        expect(s.days[4]).toEqual({ day: "2026-11-02", delivered: 3, returned: 1, rate: 75 });
        expect(s.days[5].rate).toBeNull();
        expect(s.rate).toBe(86);
        expect(s.previousRate).toBe(80);
    });

    it("has no rate when Prime finished nothing", () => {
        const s = primeHomeSummary([group()], NOW);
        expect(s.rate).toBeNull();
        expect(s.previousRate).toBeNull();
        expect(s.owed).toEqual({ cash: 0, parcels: 0 });
    });
});
