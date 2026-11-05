import { addDaysToDayKey, baghdadDayKey } from "@/lib/order-window";
import { primeMonthOutcome, type PrimeMonthParcel } from "@/lib/prime/month-report";

/** What became of the parcels handed to Prime on one Baghdad day. */
export interface PrimeDayBatch {
    /** The Baghdad day they were handed over, YYYY-MM-DD. */
    day: string;
    sent: number;
    delivered: number;
    returned: number;
    cancelled: number;
    /** Still moving (confirmed or in transit). */
    open: number;
}

/** One batch per Baghdad day of the last `days` days, today first, each filed by its orders' status. Days with nothing sent are kept, so a gap shows. */
export function primeDayBatches(parcels: readonly PrimeMonthParcel[], now: number, days: number): PrimeDayBatch[] {
    const today = baghdadDayKey(now);
    const batches = new Map<string, PrimeDayBatch>();
    for (let i = 0; i < days; i++) {
        const day = addDaysToDayKey(today, -i);
        batches.set(day, { day, sent: 0, delivered: 0, returned: 0, cancelled: 0, open: 0 });
    }
    for (const p of parcels) {
        const batch = batches.get(baghdadDayKey(Date.parse(p.sentAt)));
        if (!batch) continue;
        batch.sent += 1;
        const outcome = primeMonthOutcome(p.orderStatus);
        if (outcome === "delivered" || outcome === "returned" || outcome === "cancelled" || outcome === "open") batch[outcome] += 1;
    }
    return [...batches.values()];
}
