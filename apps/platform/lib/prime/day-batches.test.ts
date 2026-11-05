import { describe, expect, it } from "vitest";
import { primeDayBatches } from "./day-batches";
import type { PrimeMonthParcel } from "./month-report";

const NOW = Date.parse("2026-11-05T09:00:00Z");
const parcel = (sentAt: string, orderStatus: string): PrimeMonthParcel => ({ orderNumber: "1", customerName: "", city: null, sentAt, orderStatus, collected: null, fee: null, primeStatus: null });

describe("primeDayBatches", () => {
    it("files each parcel under the Baghdad day it was handed over and by what became of it", () => {
        const batches = primeDayBatches(
            [
                parcel("2026-11-05T05:00:00Z", "in_transit"),
                parcel("2026-11-04T10:00:00Z", "delivered"),
                parcel("2026-11-04T11:00:00Z", "rejected"),
                parcel("2026-11-04T12:00:00Z", "cancelled"),
                // 21:30 UTC on the 3rd is already the 4th in Baghdad.
                parcel("2026-11-03T21:30:00Z", "completed"),
            ],
            NOW,
            3,
        );
        expect(batches.map((b) => b.day)).toEqual(["2026-11-05", "2026-11-04", "2026-11-03"]);
        expect(batches[0]).toMatchObject({ sent: 1, open: 1 });
        expect(batches[1]).toMatchObject({ sent: 4, delivered: 2, returned: 1, cancelled: 1, open: 0 });
        expect(batches[2]).toMatchObject({ sent: 0 });
    });

    it("keeps empty days and ignores parcels older than the window", () => {
        const batches = primeDayBatches([parcel("2026-10-01T10:00:00Z", "delivered")], NOW, 2);
        expect(batches.map((b) => b.sent)).toEqual([0, 0]);
    });
});
