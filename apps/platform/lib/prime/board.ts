import type { PrimeShipmentView } from "@/lib/prime/chip-state";
import { baghdadDayKey, toBaghdadDayKey } from "@/lib/order-window";
import { primeBucket, primeIsStuck, primeTrack } from "@/lib/prime/track";

/** One parcel on the Prime page: Prime's side and the few order fields the page shows. */
export interface PrimeBoardParcel {
    orderId: string;
    orderStatus: string;
    view: PrimeShipmentView;
    /** What Prime collects for it (what we sent, else the order's COD amount). */
    cash: number;
}

/** The lists a number on the Prime page opens. */
export const PRIME_BOARD_LISTS = ["handed_today", "at_branch", "on_road", "delivered_today", "postponed", "returning", "needs"] as const;
export type PrimeBoardList = (typeof PRIME_BOARD_LISTS)[number];

/** A list named in a link (`/prime?list=returning`), or null when it names none. */
export function readPrimeBoardList(value: string | null | undefined): PrimeBoardList | null {
    return PRIME_BOARD_LISTS.find((list) => list === value) ?? null;
}

/** Why a parcel is on the "needs your decision" list. */
export type PrimeNeedReason = "cancelled_by_prime" | "returning" | "needs_you" | "stuck";

export interface PrimeBoard {
    lists: Record<PrimeBoardList, string[]>;
    /** Cash in the parcels each list holds (all open parcels for on_road). */
    cash: Record<"handed_today" | "on_road" | "delivered_today", number>;
    /** Open parcels still on their way (every stop, postponed and waiting on the store too; not the ones coming back). */
    out: number;
    reasons: ReadonlyMap<string, PrimeNeedReason>;
}

/** Order statuses whose parcel is still Prime's to deliver or bring back. */
const OPEN_ORDER = new Set(["confirmed", "in_transit"]);

function since(view: PrimeShipmentView): number {
    const at = Date.parse(view.statusChangedAt ?? view.sentAt);
    return Number.isFinite(at) ? at : 0;
}

/**
 * The Prime page's board: today's hand-off, where the open parcels are along
 * the way, today's deliveries, and the parcels that need a decision (Prime
 * cancelled it, it is coming back, Prime asks something, or it has not moved
 * in 3+ days), oldest first. Days are Baghdad days.
 */
export function primeBoard(parcels: readonly PrimeBoardParcel[], now: number): PrimeBoard {
    const today = baghdadDayKey(now);
    const lists: Record<PrimeBoardList, string[]> = {
        handed_today: [],
        at_branch: [],
        on_road: [],
        delivered_today: [],
        postponed: [],
        returning: [],
        needs: [],
    };
    const cash = { handed_today: 0, on_road: 0, delivered_today: 0 };
    let out = 0;
    const reasons = new Map<string, PrimeNeedReason>();
    const needs: PrimeBoardParcel[] = [];

    for (const p of parcels) {
        const { view } = p;
        const track = primeTrack(view);
        if (view.cancelledAt === null && toBaghdadDayKey(view.sentAt) === today) {
            lists.handed_today.push(p.orderId);
            cash.handed_today += p.cash;
        }
        if (track.state === "delivered") {
            if (view.statusChangedAt !== null && toBaghdadDayKey(view.statusChangedAt) === today) {
                lists.delivered_today.push(p.orderId);
                cash.delivered_today += p.cash;
            }
            continue;
        }
        const bucket = primeBucket(view);
        // A parcel Prime cancelled stays on the list until staff close the order.
        if (view.status === "CNCL" && view.cancelledAt === null && OPEN_ORDER.has(p.orderStatus)) {
            reasons.set(p.orderId, "cancelled_by_prime");
            needs.push(p);
            continue;
        }
        if (!OPEN_ORDER.has(p.orderStatus) || bucket === null) continue;

        if (bucket === "returning") {
            lists.returning.push(p.orderId);
            reasons.set(p.orderId, "returning");
            needs.push(p);
            continue;
        }
        cash.on_road += p.cash;
        out += 1;
        if (track.stop === 1) lists.at_branch.push(p.orderId);
        if (track.stop === 2 || track.stop === 3) lists.on_road.push(p.orderId);
        if (bucket === "postponed") lists.postponed.push(p.orderId);
        if (bucket === "needs_you") {
            reasons.set(p.orderId, "needs_you");
            needs.push(p);
        } else if (primeIsStuck(view, now)) {
            reasons.set(p.orderId, "stuck");
            needs.push(p);
        }
    }

    lists.needs = needs.sort((a, b) => since(a.view) - since(b.view)).map((p) => p.orderId);
    return { lists, cash, out, reasons };
}

/** A parcel that waited this many days since Prime last moved it turns amber, and past the red mark it turns red. */
export const PRIME_AGE_AMBER_DAYS = 3;
export const PRIME_AGE_RED_DAYS = 6;
export type PrimeAgeTone = "ok" | "amber" | "red";

const DAY_MS = 86_400_000;

export function primeAgeTone(days: number): PrimeAgeTone {
    if (days > PRIME_AGE_RED_DAYS) return "red";
    if (days > PRIME_AGE_AMBER_DAYS) return "amber";
    return "ok";
}

/** Whole days the longest-waiting parcel has gone without a move at Prime (or since it was sent); null when there are none. */
export function primeOldestAgeDays(views: readonly PrimeShipmentView[], now: number): number | null {
    let oldest: number | null = null;
    for (const view of views) {
        const at = since(view);
        if (at === 0) continue;
        const days = Math.max(0, Math.floor((now - at) / DAY_MS));
        if (oldest === null || days > oldest) oldest = days;
    }
    return oldest;
}
