import { describe, expect, it } from "vitest";
import { baghdadDayKey } from "@/lib/order-window";
import { primeReturnsSummary, type PrimeReturnsGroup } from "./returns";

const NOW = Date.parse("2026-11-04T09:00:00Z");
const day = (daysAgo: number) => baghdadDayKey(NOW - daysAgo * 86_400_000);

const delivered = (parcels: number, daysAgo: number, over: Partial<PrimeReturnsGroup> = {}): PrimeReturnsGroup => ({
    shipmentStatus: "DELIVERED",
    stepCode: "DLEIVERD",
    cancelled: false,
    resent: false,
    governorate: "BGD",
    reason: null,
    changedDay: day(daysAgo),
    parcels,
    ...over,
});
const returning = (parcels: number, daysAgo: number, over: Partial<PrimeReturnsGroup> = {}): PrimeReturnsGroup =>
    delivered(parcels, daysAgo, { shipmentStatus: "FAILED_DELIVER_RETURNED_TO_SENDER", stepCode: "RTN_INSTORE", ...over });

describe("primeReturnsSummary", () => {
    it("reads the last 30 days against the 30 before", () => {
        const summary = primeReturnsSummary(
            [
                delivered(80, 2),
                returning(10, 5, { reason: "رفض العميل" }),
                returning(5, 29, { reason: "لا يجاوب" }),
                // The 30 days before: 20 of 100 came back.
                delivered(80, 30),
                returning(20, 59),
                // Older than both windows, and parcels Prime has not finished, are left out.
                returning(50, 61),
                delivered(3, 4, { shipmentStatus: "ONWAY", stepCode: "ONWAY" }),
                delivered(4, 4, { cancelled: true }),
            ],
            NOW,
        );

        expect(summary.finished).toBe(95);
        expect(summary.returned).toBe(15);
        expect(summary.rate).toBe(15.8);
        expect(summary.previousRate).toBe(20);
    });

    it("lists the team's reasons most first, with parcels not given one yet last", () => {
        const { reasons } = primeReturnsSummary(
            [returning(4, 1), returning(9, 2, { reason: "رفض العميل" }), returning(3, 3, { reason: "الهاتف مغلق" }), returning(2, 4, { reason: "رفض العميل" })],
            NOW,
        );
        expect(reasons).toEqual([
            { reason: "رفض العميل", parcels: 11 },
            { reason: "الهاتف مغلق", parcels: 3 },
            { reason: null, parcels: 4 },
        ]);
    });

    it("ranks governorates by the share that comes back and counts parcels a resend saved", () => {
        const summary = primeReturnsSummary(
            [
                delivered(44, 1, { governorate: "ANB" }),
                returning(14, 1, { governorate: "ANB" }),
                delivered(466, 1),
                returning(46, 1),
                delivered(83, 1, { governorate: "KOT" }),
                returning(5, 1, { governorate: "KOT" }),
                delivered(3, 1, { resent: true }),
            ],
            NOW,
        );
        expect(summary.areas.map((a) => [a.governorate, a.parcels, a.returned, a.rate])).toEqual([
            ["ANB", 58, 14, 24.1],
            ["BGD", 515, 46, 8.9],
            ["KOT", 88, 5, 5.7],
        ]);
        expect(summary.savedByResend).toBe(3);
    });

    it("has no share when Prime finished nothing", () => {
        expect(primeReturnsSummary([], NOW)).toEqual({ finished: 0, returned: 0, rate: null, previousRate: null, savedByResend: 0, reasons: [], areas: [] });
    });
});
