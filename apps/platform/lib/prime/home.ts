import { baghdadDayKey } from "@/lib/order-window";
import { primeTrack } from "@/lib/prime/track";

/** One row of prime_home_groups(): parcels of the last 60 days that share every field but the sums. */
export interface PrimeHomeGroup {
    shipmentStatus: string | null;
    stepCode: string | null;
    cancelled: boolean;
    paid: boolean;
    /** The order is still confirmed or in transit. */
    orderOpen: boolean;
    /** Baghdad days, YYYY-MM-DD. */
    sentDay: string;
    changedDay: string;
    parcels: number;
    /** What Prime collects for these parcels (whole IQD). */
    collect: number;
    /** Prime's fees for them, as Prime last told us. */
    fees: number;
}

/** One Baghdad day of the delivery rate: parcels Prime finished that day. */
export interface PrimeRateDay {
    day: string;
    delivered: number;
    returned: number;
    /** delivered ÷ (delivered + returned), 0–100, or null when Prime finished none. */
    rate: number | null;
}

export interface PrimeHomeSummary {
    /** Delivered and not paid yet: what Prime holds for the store (collected minus its fees). */
    owed: { cash: number; parcels: number };
    /** Parcels handed to Prime this Baghdad month. */
    month: {
        fees: number;
        /** What reaches the store from them (collected minus fees): paid, delivered and unpaid, still on the way. */
        paid: number;
        atPrime: number;
        onRoad: number;
    };
    /** The last 7 Baghdad days, oldest first. */
    days: PrimeRateDay[];
    /** Rate over the last 7 days and the 7 before, or null when Prime finished none. */
    rate: number | null;
    previousRate: number | null;
}

const DAY_MS = 86_400_000;

const percent = (delivered: number, returned: number) =>
    delivered + returned === 0 ? null : Math.round((delivered / (delivered + returned)) * 100);

/**
 * The home page's Prime tiles from the grouped parcels: what Prime holds for
 * the store, this month's fees and where its cash is, and the delivery rate
 * of the parcels Prime finished (delivered, or coming back) per Baghdad day.
 * A parcel's state is read with the order card's own rule (primeTrack).
 */
export function primeHomeSummary(groups: readonly PrimeHomeGroup[], now: number): PrimeHomeSummary {
    const today = baghdadDayKey(now);
    const monthStart = `${today.slice(0, 7)}-01`;
    const dayKeys = Array.from({ length: 14 }, (_, i) => baghdadDayKey(now - (13 - i) * DAY_MS));
    const finished = new Map(dayKeys.map((day) => [day, { delivered: 0, returned: 0 }]));

    const owed = { cash: 0, parcels: 0 };
    const month = { fees: 0, paid: 0, atPrime: 0, onRoad: 0 };

    for (const g of groups) {
        const { state } = primeTrack({
            status: g.shipmentStatus,
            stepCode: g.stepCode,
            cancelledAt: g.cancelled ? g.changedDay : null,
            pushError: null,
            cancelRefusedAt: null,
        });
        const net = g.collect - g.fees;

        if (state === "delivered" && !g.paid) {
            owed.cash += net;
            owed.parcels += g.parcels;
        }

        if (g.sentDay >= monthStart && state !== "cancelled") {
            month.fees += g.fees;
            if (state === "delivered") {
                if (g.paid) month.paid += net;
                else month.atPrime += net;
            } else if (state !== "returning" && g.orderOpen) {
                month.onRoad += net;
            }
        }

        const day = finished.get(g.changedDay);
        if (day) {
            if (state === "delivered") day.delivered += g.parcels;
            else if (state === "returning") day.returned += g.parcels;
        }
    }

    const all = dayKeys.map((day): PrimeRateDay => {
        const { delivered, returned } = finished.get(day) ?? { delivered: 0, returned: 0 };
        return { day, delivered, returned, rate: percent(delivered, returned) };
    });
    const sum = (days: PrimeRateDay[]) => days.reduce((acc, d) => ({ delivered: acc.delivered + d.delivered, returned: acc.returned + d.returned }), { delivered: 0, returned: 0 });
    const last = sum(all.slice(7));
    const before = sum(all.slice(0, 7));

    return {
        owed,
        month,
        days: all.slice(7),
        rate: percent(last.delivered, last.returned),
        previousRate: percent(before.delivered, before.returned),
    };
}
