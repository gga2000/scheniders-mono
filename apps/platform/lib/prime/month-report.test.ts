import { describe, expect, it } from "vitest";
import { primeMonthKey, primeMonthOutcome, primeMonthRange, primeMonthReport, primeRecentMonths, type PrimeMonthParcel } from "./month-report";

const parcel = (orderStatus: string, collected: number | null = 12500, fee: number | null = 5000): PrimeMonthParcel => ({
    orderNumber: "1",
    customerName: "زبون",
    city: "الكوت",
    sentAt: "2026-11-02T08:00:00.000Z",
    orderStatus,
    collected,
    fee,
    primeStatus: null,
});

describe("primeMonthReport", () => {
    it("counts each outcome and sums cash and fees only on delivered parcels", () => {
        const report = primeMonthReport([
            parcel("delivered", 18000, 5000),
            parcel("completed", 12000, 5000),
            parcel("rejected"),
            parcel("return_pending"),
            parcel("cancelled"),
            parcel("in_transit"),
            parcel("confirmed"),
            parcel("new"),
        ]);
        expect(report).toEqual({ sent: 8, delivered: 2, returned: 2, cancelled: 1, open: 2, collected: 30000, fees: 10000 });
    });

    it("treats unknown cash and fee as zero", () => {
        expect(primeMonthReport([parcel("delivered", null, null)])).toMatchObject({ delivered: 1, collected: 0, fees: 0 });
    });

    it("reports an empty month", () => {
        expect(primeMonthReport([])).toEqual({ sent: 0, delivered: 0, returned: 0, cancelled: 0, open: 0, collected: 0, fees: 0 });
    });
});

describe("primeMonthOutcome", () => {
    it("files an order status under what became of the parcel", () => {
        expect(primeMonthOutcome("delivered")).toBe("delivered");
        expect(primeMonthOutcome("rejected")).toBe("returned");
        expect(primeMonthOutcome("cancelled")).toBe("cancelled");
        expect(primeMonthOutcome("in_transit")).toBe("open");
        expect(primeMonthOutcome("suspended")).toBe("other");
    });
});

describe("Baghdad months", () => {
    it("names a month by Baghdad time, so 22:00 UTC on the last day is already next month", () => {
        expect(primeMonthKey(Date.parse("2026-10-31T21:30:00Z"))).toBe("2026-11");
        expect(primeMonthKey(Date.parse("2026-10-31T20:59:00Z"))).toBe("2026-10");
    });

    it("gives the exact range of a month, end exclusive", () => {
        expect(primeMonthRange("2026-11")).toEqual({ from: "2026-10-31T21:00:00.000Z", to: "2026-11-30T21:00:00.000Z" });
        expect(primeMonthRange("2026-12")?.to).toBe("2026-12-31T21:00:00.000Z");
        expect(primeMonthRange("2026-13")).toBeNull();
        expect(primeMonthRange("nope")).toBeNull();
    });

    it("lists recent months newest first across a year end", () => {
        expect(primeRecentMonths(Date.parse("2027-01-10T10:00:00Z"), 3)).toEqual(["2027-01", "2026-12", "2026-11"]);
    });
});
