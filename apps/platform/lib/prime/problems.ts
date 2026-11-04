import { primeChipState, type PrimeShipmentView } from "@/lib/prime/chip-state";
import { PRIME_FAILED_STEPS, primeIsStuck, primeTrack } from "@/lib/prime/track";

/**
 * Why a parcel is on the Prime page's problems tab, most urgent first:
 * failed: delivery failed (no answer, refused by the driver, pickup refused); call the customer before Prime sends it back.
 * confirm: Prime waits on the store (a new amount, that the customer got it, a check, or a change of ours it refused).
 * returning: coming back; one more attempt can still save it.
 * cancelled_by_prime: Prime cancelled it; the order needs closing or sending again.
 * postponed: the customer asked for another day.
 * stuck: nothing moved at Prime for 3+ days.
 */
export const PRIME_PROBLEM_KINDS = ["failed", "confirm", "returning", "cancelled_by_prime", "postponed", "stuck"] as const;
export type PrimeProblemKind = (typeof PRIME_PROBLEM_KINDS)[number];

export interface PrimeProblem {
    orderId: string;
    kind: PrimeProblemKind;
    /** When Prime last moved the parcel (ISO), else when it was sent. */
    since: string;
    /** Someone marked it handled since Prime last moved it. */
    handled: boolean;
}

export interface PrimeProblemParcel {
    orderId: string;
    orderStatus: string;
    view: PrimeShipmentView;
}

const OPEN_ORDER = new Set(["confirmed", "in_transit"]);

/** The parcel's problem, or null when it has none. */
export function primeProblemKind(view: PrimeShipmentView, orderStatus: string, now: number): PrimeProblemKind | null {
    if (view.cancelledAt !== null) return null;
    if (view.status === "CNCL") return orderStatus === "cancelled" ? null : "cancelled_by_prime";
    if (!OPEN_ORDER.has(orderStatus)) return null;
    const { state } = primeTrack(view);
    const step = view.stepCode;
    if (state === "returning") return primeChipState(view, orderStatus).resendRequested ? null : "returning";
    if (state === "needs_you") return step !== null && PRIME_FAILED_STEPS.has(step) ? "failed" : "confirm";
    if (state === "postponed") return "postponed";
    if (state === "moving" && primeIsStuck(view, now)) return "stuck";
    return null;
}

/** A mark counts only until Prime moves the parcel again. */
export function primeProblemHandled(view: Pick<PrimeShipmentView, "problemCheckedAt" | "statusChangedAt" | "sentAt">): boolean {
    if (!view.problemCheckedAt) return false;
    const checked = Date.parse(view.problemCheckedAt);
    const moved = Date.parse(view.statusChangedAt ?? view.sentAt);
    return Number.isFinite(checked) && (!Number.isFinite(moved) || checked >= moved);
}

const RANK: Readonly<Record<PrimeProblemKind, number>> = Object.fromEntries(PRIME_PROBLEM_KINDS.map((k, i) => [k, i])) as Record<PrimeProblemKind, number>;

/**
 * The problems tab's list: unhandled first, then by how urgent the kind is,
 * then the one waiting longest first.
 */
export function primeProblems(parcels: readonly PrimeProblemParcel[], now: number): PrimeProblem[] {
    const problems: PrimeProblem[] = [];
    for (const p of parcels) {
        const kind = primeProblemKind(p.view, p.orderStatus, now);
        if (!kind) continue;
        problems.push({ orderId: p.orderId, kind, since: p.view.statusChangedAt ?? p.view.sentAt, handled: primeProblemHandled(p.view) });
    }
    return problems.sort((a, b) => Number(a.handled) - Number(b.handled) || RANK[a.kind] - RANK[b.kind] || Date.parse(a.since) - Date.parse(b.since));
}

/** The problems among the Prime page's parcels (its views and orders by order id). */
export function primeProblemsFrom(
    views: ReadonlyMap<string, PrimeShipmentView>,
    orders: ReadonlyMap<string, { status: string }>,
    now: number,
): PrimeProblem[] {
    const parcels: PrimeProblemParcel[] = [];
    for (const [orderId, view] of views) {
        const order = orders.get(orderId);
        if (order) parcels.push({ orderId, orderStatus: order.status, view });
    }
    return primeProblems(parcels, now);
}
