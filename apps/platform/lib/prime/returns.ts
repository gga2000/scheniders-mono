import { baghdadDayKey } from "@/lib/order-window";
import { primeTrack } from "@/lib/prime/track";

/** One row of prime_returns_groups(): Prime parcels of the last 60 days that share every field but the count. */
export interface PrimeReturnsGroup {
    shipmentStatus: string | null;
    stepCode: string | null;
    cancelled: boolean;
    /** Staff asked Prime to deliver it again after it was coming back. */
    resent: boolean;
    /** The order's governorate code (BGD, BAS…), or null when it has none. */
    governorate: string | null;
    /** The reason the store's team recorded when it rejected the order, else Prime's return reason; null when neither. */
    reason: string | null;
    /** Baghdad day Prime last moved it, YYYY-MM-DD. */
    changedDay: string;
    parcels: number;
}

export interface PrimeReturnsReason {
    /** As the team (or else Prime) wrote it; null for parcels coming back with no reason recorded yet. */
    reason: string | null;
    parcels: number;
}

export interface PrimeReturnsArea {
    governorate: string | null;
    /** Parcels Prime finished there: delivered or coming back. */
    parcels: number;
    returned: number;
    /** Share coming back, 0–100 with one decimal. */
    rate: number;
}

export interface PrimeReturnsSummary {
    /** Parcels Prime finished in the window: delivered or coming back. */
    finished: number;
    returned: number;
    /** Share coming back over the last 30 days and the 30 before, 0–100 with one decimal; null when Prime finished none. */
    rate: number | null;
    previousRate: number | null;
    /** Parcels that were coming back, were sent again on staff's request, and were delivered. */
    savedByResend: number;
    /** Why they came back, most first; the "none recorded yet" bucket last. */
    reasons: PrimeReturnsReason[];
    /** By governorate, the highest share coming back first. */
    areas: PrimeReturnsArea[];
}

/** The window the returns tab reads, in Baghdad days. */
export const PRIME_RETURNS_DAYS = 30;
const DAY_MS = 86_400_000;

const share = (returned: number, finished: number) => (finished === 0 ? null : Math.round((returned / finished) * 1000) / 10);

/**
 * Why the store's Prime parcels come back, over the last 30 Baghdad days
 * against the 30 before: how many and what share, which ones a resend
 * saved, the reasons the team recorded, and the governorates where most
 * come back. A parcel's state is read with the order card's own rule.
 */
export function primeReturnsSummary(groups: readonly PrimeReturnsGroup[], now: number): PrimeReturnsSummary {
    const from = baghdadDayKey(now - (PRIME_RETURNS_DAYS - 1) * DAY_MS);
    const previousFrom = baghdadDayKey(now - (2 * PRIME_RETURNS_DAYS - 1) * DAY_MS);
    const now30 = { delivered: 0, returned: 0 };
    const before30 = { delivered: 0, returned: 0 };
    let savedByResend = 0;
    const reasons = new Map<string | null, number>();
    const areas = new Map<string | null, { parcels: number; returned: number }>();

    for (const g of groups) {
        if (g.changedDay < previousFrom) continue;
        const { state } = primeTrack({
            status: g.shipmentStatus,
            stepCode: g.stepCode,
            cancelledAt: g.cancelled ? g.changedDay : null,
            pushError: null,
            cancelRefusedAt: null,
        });
        if (state !== "delivered" && state !== "returning") continue;
        const counts = g.changedDay >= from ? now30 : before30;
        if (state === "delivered") counts.delivered += g.parcels;
        else counts.returned += g.parcels;
        if (counts !== now30) continue;

        if (state === "delivered" && g.resent) savedByResend += g.parcels;
        const area = areas.get(g.governorate) ?? { parcels: 0, returned: 0 };
        area.parcels += g.parcels;
        if (state === "returning") {
            area.returned += g.parcels;
            reasons.set(g.reason, (reasons.get(g.reason) ?? 0) + g.parcels);
        }
        areas.set(g.governorate, area);
    }

    return {
        finished: now30.delivered + now30.returned,
        returned: now30.returned,
        rate: share(now30.returned, now30.delivered + now30.returned),
        previousRate: share(before30.returned, before30.delivered + before30.returned),
        savedByResend,
        reasons: [...reasons]
            .map(([reason, parcels]) => ({ reason, parcels }))
            .sort((a, b) => Number(a.reason === null) - Number(b.reason === null) || b.parcels - a.parcels),
        areas: [...areas]
            .map(([governorate, a]) => ({ governorate, parcels: a.parcels, returned: a.returned, rate: share(a.returned, a.parcels) ?? 0 }))
            .sort((a, b) => b.rate - a.rate || b.parcels - a.parcels),
    };
}
