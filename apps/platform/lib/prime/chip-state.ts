/**
 * What an order card's Prime chip shows, from the order's prime_shipments
 * row. Pure, so the card and its tests share one reading. Client-safe: no
 * server imports.
 */

/** One shipment as the card reads it (hooks/use-prime-shipments). */
export interface PrimeShipmentView {
    caseId: number;
    status: string | null;
    /** Prime's step code (list-of-system-steps): where the parcel is (lib/prime/track). */
    stepCode: string | null;
    /** Prime's own Arabic step name (list-of-system-steps). */
    stepName: string | null;
    /** When the parcel was handed to Prime. */
    sentAt: string;
    /** The cash Prime collects at the door (whole IQD), as Prime last reported it. */
    receiptAmountIqd: number | null;
    /** Prime's delivery charge for the parcel (whole IQD), as Prime last reported it. */
    shipmentCharge: number | null;
    checkedAt: string | null;
    statusChangedAt: string | null;
    /** An edit or cancellation is queued and has not reached Prime yet. */
    pending: boolean;
    /** Prime's words for the last change it refused, or `skip:<reason>` when ours could not be sent. */
    pushError: string | null;
    cancelledAt: string | null;
    cancelRefusedAt: string | null;
    resentAt: string | null;
    /** Prime's words for why the parcel is coming back, from its webhook; null when Prime said none. */
    returnReason: string | null;
    /** Prime's words for why delivery was put off, and the day it was put off to (as Prime wrote it). */
    postponeReason: string | null;
    postponedTo: string | null;
    /** Someone marked the parcel's problem handled (Prime page's problems tab): when, who, and their note. */
    problemCheckedAt: string | null;
    problemCheckedBy: string | null;
    problemNote: string | null;
    /** The failed-delivery WhatsApp went to the customer (lib/prime/failed-notice): when, and who sent it by hand (null = the app). */
    warnedAt: string | null;
    warnedBy: string | null;
}

export type PrimeChipTone = "progress" | "warn" | "problem" | "muted";

export interface PrimeChipState {
    tone: PrimeChipTone;
    /** Prime's step name; null when the label is ours (`deleted`). */
    stepName: string | null;
    deleted: boolean;
    pending: boolean;
    /** The resend button: the parcel is on its way back and no resend is waiting on Prime. */
    canResend: boolean;
    /** A resend was asked for and Prime has not moved the parcel since. */
    resendRequested: boolean;
}

/** Prime's status for a parcel coming back to the store. */
export const PRIME_RETURNING = "FAILED_DELIVER_RETURNED_TO_SENDER";
/** Statuses where Prime stopped delivering as planned: amber. */
const WARN_STATUSES = new Set([PRIME_RETURNING, "CNCL", "PART_DELIVERED", "DELIVERED_CHANGE_PRICE", "POSTPONED"]);
/**
 * Failed attempts the driver still holds: Prime takes a new attempt with a
 * fix (a new phone, a better address) before it sends the parcel back.
 */
export const PRIME_RESENDABLE_STEPS: ReadonlySet<string> = new Set(["RTN_WITHAGENT", "DLV_AGENT_REJECT"]);

/** Prime takes a resend request: the parcel is coming back, or its attempt failed with the driver. */
export function primeCanBeResent(view: Pick<PrimeShipmentView, "status" | "stepCode">): boolean {
    return view.status === PRIME_RETURNING || (view.stepCode !== null && PRIME_RESENDABLE_STEPS.has(view.stepCode));
}

/** Orders still out with Prime. */
const OPEN_ORDER_STATUSES = new Set(["confirmed", "in_transit"]);

export function primeChipState(view: PrimeShipmentView, orderStatus: string): PrimeChipState {
    const deleted = view.cancelledAt !== null;
    const resendable = primeCanBeResent(view);
    const resendRequested =
        resendable &&
        view.resentAt !== null &&
        (view.statusChangedAt === null || Date.parse(view.resentAt) >= Date.parse(view.statusChangedAt));
    const canResend = resendable && OPEN_ORDER_STATUSES.has(orderStatus) && !resendRequested && !deleted;

    let tone: PrimeChipTone = "progress";
    if (deleted) tone = "muted";
    else if (view.pushError !== null || view.cancelRefusedAt !== null) tone = "problem";
    else if (view.status !== null && WARN_STATUSES.has(view.status)) tone = "warn";

    return {
        tone,
        stepName: deleted ? null : (view.stepName ?? view.status),
        deleted,
        pending: view.pending && !deleted,
        canResend,
        resendRequested,
    };
}

/** Our own reason when an edit could not be sent (stored as `skip:<reason>`), else null for Prime's words. */
export function primeSkipReason(pushError: string | null): string | null {
    return pushError?.startsWith("skip:") ? pushError.slice(5) : null;
}
