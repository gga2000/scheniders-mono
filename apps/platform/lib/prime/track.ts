/**
 * Where a Prime parcel is on its way, read from its prime_shipments row: the
 * five stops of the order card's Prime band, the bucket the "in transit" Prime
 * row counts it in, and the band's one quick action. Pure and client-safe, so
 * the band, the row and their tests share one reading.
 *
 * Prime reports two things per parcel: a simplified status (ONWAY, DELIVERED,
 * POSTPONED, FAILED_DELIVER_RETURNED_TO_SENDER…) and its own step code (one of
 * the ~90 in list-of-system-steps). The step says where the parcel is; the
 * status wins when it is final (delivered, coming back, cancelled).
 */
import { primeChipState, PRIME_RETURNING, type PrimeShipmentView } from "@/lib/prime/chip-state";

/** 0 sent · 1 Prime's branch · 2 on the way · 3 with the driver · 4 delivered (or, coming back: back to you). */
export type PrimeStop = 0 | 1 | 2 | 3 | 4;
export const PRIME_STOP_COUNT = 5;

/**
 * moving: on its way as planned. postponed: the customer asked for another
 * day. needs_you: someone at the store has to act (call the customer, confirm
 * a new amount, fix a refused change). returning: Prime is bringing it back.
 * delivered: done. cancelled: deleted at Prime, or cancelled by Prime.
 */
export type PrimeTrackState = "moving" | "postponed" | "needs_you" | "returning" | "delivered" | "cancelled";

export interface PrimeTrack {
    stop: PrimeStop;
    state: PrimeTrackState;
}

/** Prime's step codes by the stop they belong to (list-of-system-steps, read on Prime's test system 2026-11-03). */
const STEP_STOP: Readonly<Record<string, PrimeStop>> = {
    DRAFT: 0,
    READYTOPRINT: 0,
    READYTOPICKUP: 0,
    PICKUP_REJECT: 0,
    LANDING_PAGE: 0,
    UNDER_REVISION: 0,
    NEWINSTORE: 1,
    PRINTMANIFEST: 1,
    MANIFEST_BRANCHES: 1,
    NEW_ONWAY: 2,
    LIAISONAGT_NEWONWAY: 2,
    RESENEDSHIPMENTS: 2,
    ONWAY: 3,
    TRY_AGAIN: 3,
    CUST_AGREED: 3,
    POSTPONED: 3,
    RTN_WITHAGENT: 3,
    DLV_AGENT_REJECT: 3,
    CHNG_AMT_CFM_REQUIRED: 3,
    CHANGE_SHIPMENT_AMOUNT_APPROVED: 3,
    DLEIVERD: 4,
    SUCCARCHV: 4,
    PART_SUCC: 4,
    PART_SUCC1: 4,
    SUCC_CHANGEPRICE: 4,
    FORCE_DLV: 4,
};

/** Steps of a parcel on its way back to the store. */
const RETURNING_STEPS = new Set([
    "RTN_INSTORE",
    "RTNARCHV",
    "RTN_WITHLIAISONAGENT",
    "RTN_INSTORE_WAITLIAISON",
    "RTN_MANIFEST_LIAISON",
    "RTN_WITH_PICKUPAGENT",
    "RETURNED_TO_CUSTOMER",
    "SNAGS_FAILED_TOHANDLE",
]);

/** Steps where Prime waits on the store: a failed attempt, a refused pickup, a new amount to confirm. */
const NEEDS_YOU_STEPS = new Set(["RTN_WITHAGENT", "DLV_AGENT_REJECT", "PICKUP_REJECT", "CHNG_AMT_CFM_REQUIRED"]);

const DELIVERED_STATUSES = new Set(["DELIVERED", "PART_DELIVERED", "DELIVERED_CHANGE_PRICE"]);

/** What the track reads from a shipment (a recorded case-history step carries only the first two). */
export type PrimeTrackInput = Pick<PrimeShipmentView, "status" | "stepCode" | "cancelledAt" | "pushError" | "cancelRefusedAt">;

export function primeTrack(view: PrimeTrackInput): PrimeTrack {
    const step = view.stepCode;
    const stepStop = step ? STEP_STOP[step] : undefined;
    if (view.cancelledAt !== null) return { stop: stepStop ?? 0, state: "cancelled" };
    if (view.status === PRIME_RETURNING || (step !== null && RETURNING_STEPS.has(step))) return { stop: 4, state: "returning" };
    if ((view.status !== null && DELIVERED_STATUSES.has(view.status)) || stepStop === 4) return { stop: 4, state: "delivered" };
    if (view.status === "CNCL") return { stop: stepStop ?? 0, state: "cancelled" };

    // A step Prime added after we read its list: still out with Prime, so "on the way".
    const stop: PrimeStop = stepStop ?? (step === null ? 0 : 2);
    if ((step !== null && NEEDS_YOU_STEPS.has(step)) || view.pushError !== null || view.cancelRefusedAt !== null) {
        return { stop, state: "needs_you" };
    }
    if (view.status === "POSTPONED" || step === "POSTPONED") return { stop: 3, state: "postponed" };
    return { stop, state: "moving" };
}

/** The "in transit" Prime row's buckets: each open parcel is in exactly one. */
export type PrimeBucket = "on_way" | "postponed" | "needs_you" | "returning";
export const PRIME_BUCKETS: readonly PrimeBucket[] = ["on_way", "postponed", "needs_you", "returning"];

/** What the "in transit" Prime row can filter the list to: a bucket, or parcels stuck 3+ days. */
export type PrimeRowFilter = PrimeBucket | "stuck";

/** A parcel with no move for this long is stuck (it overlaps the buckets). */
export const PRIME_STUCK_MS = 3 * 86_400_000;

/** The parcel's bucket, or null once it is delivered or cancelled. A parcel Prime cancelled is the store's to sort out. */
export function primeBucket(view: PrimeShipmentView): PrimeBucket | null {
    if (view.status === "CNCL" && view.cancelledAt === null) return "needs_you";
    const { state } = primeTrack(view);
    switch (state) {
        case "moving":
            return "on_way";
        case "postponed":
        case "needs_you":
        case "returning":
            return state;
        default:
            return null;
    }
}

/** Open, and nothing has moved at Prime for three days (counted from the send when Prime never moved it). */
export function primeIsStuck(view: PrimeShipmentView, now: number): boolean {
    if (primeBucket(view) === null) return false;
    const since = Date.parse(view.statusChangedAt ?? view.sentAt);
    return Number.isFinite(since) && now - since > PRIME_STUCK_MS;
}

/** The band's one quick action: resend a parcel coming back, remind a customer who postponed, else open the journey. */
export type PrimeBandAction = "resend" | "remind" | "journey";

export function primeBandAction(view: PrimeShipmentView, orderStatus: string): PrimeBandAction {
    if (primeChipState(view, orderStatus).canResend) return "resend";
    if (primeTrack(view).state === "postponed") return "remind";
    return "journey";
}

/** The newest time Prime was read for any of the parcels (the row's "N min ago"), or null when none was read yet. */
export function primeLastChecked(views: Iterable<PrimeShipmentView>): number | null {
    let newest: number | null = null;
    for (const view of views) {
        if (!view.checkedAt) continue;
        const at = Date.parse(view.checkedAt);
        if (Number.isFinite(at) && (newest === null || at > newest)) newest = at;
    }
    return newest;
}

/**
 * A Prime time (Baghdad wall clock) as an ISO instant. Prime writes it two
 * ways: case-history "2026-11-04 00:02:24", tickets "2026-1-14 10:22:31 AM".
 * Iraq has no daylight saving: Baghdad is always UTC+3.
 */
export function primeHistoryTime(value: string): string | null {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?/i.exec(value.trim());
    if (!match) return null;
    const [, year, month, day, hourText, minute, second = "00", half] = match;
    let hour = Number(hourText);
    if (half) {
        if (hour < 1 || hour > 12) return null;
        hour = (hour % 12) + (half.toUpperCase() === "PM" ? 12 : 0);
    }
    if (hour > 23) return null;
    const pad = (n: string | number) => String(n).padStart(2, "0");
    const at = Date.parse(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${minute}:${second}+03:00`);
    return Number.isFinite(at) ? new Date(at).toISOString() : null;
}
