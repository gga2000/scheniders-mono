// =============================================
// 48-HOUR DUPLICATE-ORDER DETECTION
//
// The orders page already had a ±72h duplicate check (`getDuplicatesForOrder`),
// but it is status-blind and its only output is a colour change that looks the
// same as an ordinary returning customer. This index answers the narrower, more
// expensive question: did this customer order twice inside two days, and is real
// money already committed on both?
//
// Spec: docs/superpowers/specs/2026-09-11-duplicate-window-detection-design.md
// =============================================

import type { Order, OrderStatus } from "@/types/order";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { baghdadDayKey, type OrderWindow } from "@/lib/order-window";

export const DUPLICATE_WINDOW_HOURS = 48;
const WINDOW_MS = DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * Statuses where the order costs something to duplicate: stock is reserved, a
 * courier slot is booked, COD is out for collection. Two of these on one phone
 * is the pairing that actually loses money.
 */
const COMMITTED_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
    "confirmed",
    "in_transit",
    "delivered",
    "completed",
]);

/**
 * Already-resolved orders. A cancelled twin is not a pending double-dispatch, and
 * flagging it would train staff to dismiss the banner.
 */
const DEAD_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
    "cancelled",
    "rejected",
    "refund_delivered",
    "refund_failed",
]);

export type DuplicateSeverity = "critical" | "warning";

export interface DuplicateWindowAlert {
    /** The twin the banner names — the closest committed one when critical, else the closest in time. */
    primary: Order;
    /** Every twin inside the window, closest in time first. */
    twins: Order[];
    /** Absolute gap in minutes between this order and `primary`. */
    gapMinutes: number;
    /** This order and `primary` fall on one Baghdad calendar date. */
    sameDay: boolean;
    severity: DuplicateSeverity;
    /** The normalized number this order and `primary` have in common. */
    sharedNumber: string;
    /**
     * True only when BOTH orders lead with the shared number. When false the two
     * cards display different primaries, so the banner has to name the number they
     * actually have in common or the match looks like a false positive.
     */
    matchedOnPrimary: boolean;
}

export function isCommittedStatus(status: OrderStatus): boolean {
    return COMMITTED_STATUSES.has(status);
}

/** Iraq is UTC+3 year-round, but formatting via the zone keeps it honest if that ever changes. */
function baghdadDate(iso: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Baghdad",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(iso));
}

/**
 * An order can neither raise an alert nor serve as someone else's twin when it is
 * a return, archived, or already resolved. Orders without a usable phone cannot be
 * grouped at all.
 */
function isEligible(order: Order): boolean {
    if (order.is_return || order.is_archived) return false;
    if (DEAD_STATUSES.has(order.status)) return false;
    return orderNumbers(order).length > 0;
}

/**
 * Every distinct number an order can be reached on, normalized. A customer who
 * gives the same two lines in either order is still the same customer.
 */
function orderNumbers(order: Order): string[] {
    const numbers = [
        normalizePhoneForSearch(order.phone),
        normalizePhoneForSearch(order.secondary_phone ?? ""),
    ].filter(Boolean);
    return [...new Set(numbers)];
}

/**
 * Build the whole index in one pass over the order book.
 *
 * `orderRepository.findAll()` pages every non-archived order into the client, so
 * this sees the complete candidate set — no pagination blind spot, no extra query.
 */
export function buildDuplicateWindowIndex(
    orders: Order[],
): Map<string, DuplicateWindowAlert> {
    const alerts = new Map<string, DuplicateWindowAlert>();

    // 1. Index every eligible order under BOTH of its numbers.
    //
    //    Keying on the primary alone missed the real-world case: the same customer's
    //    two orders can carry the same pair of numbers in opposite slots (an agent
    //    swaps them, or the customer leads with the other line). Those landed in two
    //    different groups and never met.
    const byNumber = new Map<string, Order[]>();
    const numbersOf = new Map<string, string[]>();

    for (const order of orders) {
        if (!isEligible(order)) continue;
        const numbers = orderNumbers(order);
        numbersOf.set(order.id, numbers);
        for (const number of numbers) {
            const group = byNumber.get(number);
            if (group) group.push(order);
            else byNumber.set(number, [order]);
        }
    }

    // 2. For each order, the candidates are every order reachable through any of its
    //    numbers. Matching is pairwise on purpose — no transitive chaining, so an
    //    order sharing a number with A and another with B does not marry A to B.
    for (const [orderId, numbers] of numbersOf) {
        const subject = byNumber.get(numbers[0])?.find(o => o.id === orderId);
        if (!subject) continue;

        // The merchant has already declared this one legitimate.
        if (subject.is_verified_customer === true) continue;

        const subjectTime = new Date(subject.created_at).getTime();
        if (Number.isNaN(subjectTime)) continue;

        const seen = new Set<string>([subject.id]);
        const twins: Order[] = [];
        const sharedBy = new Map<string, string>();

        for (const number of numbers) {
            for (const other of byNumber.get(number) ?? []) {
                if (seen.has(other.id)) continue;
                const otherTime = new Date(other.created_at).getTime();
                if (Number.isNaN(otherTime)) continue;
                if (Math.abs(otherTime - subjectTime) > WINDOW_MS) continue;
                seen.add(other.id);
                twins.push(other);
                sharedBy.set(other.id, number);
            }
        }

        if (twins.length === 0) continue;

        twins.sort(
            (a, b) =>
                Math.abs(new Date(a.created_at).getTime() - subjectTime) -
                Math.abs(new Date(b.created_at).getTime() - subjectTime),
        );

        // Critical needs a committed twin, not merely the *closest* twin being
        // committed: with three orders in a window the nearest may be harmless
        // while a confirmed one sits an hour further out.
        const committedTwins = twins.filter(t => isCommittedStatus(t.status));
        const severity: DuplicateSeverity =
            isCommittedStatus(subject.status) && committedTwins.length > 0
                ? "critical"
                : "warning";

        const primary = severity === "critical" ? committedTwins[0] : twins[0];
        const primaryTime = new Date(primary.created_at).getTime();
        const sharedNumber = sharedBy.get(primary.id) ?? numbers[0];

        alerts.set(subject.id, {
            primary,
            twins,
            gapMinutes: Math.round(Math.abs(primaryTime - subjectTime) / 60000),
            sameDay: baghdadDate(subject.created_at) === baghdadDate(primary.created_at),
            severity,
            sharedNumber,
            matchedOnPrimary:
                sharedNumber === normalizePhoneForSearch(subject.phone) &&
                sharedNumber === normalizePhoneForSearch(primary.phone),
        });
    }

    return alerts;
}

/**
 * The twin that makes confirming this order a double-dispatch: same phone, inside
 * the window, already committed. Used to gate the confirm action.
 */
export function committedTwinBlockingConfirm(
    orderId: string,
    index: Map<string, DuplicateWindowAlert>,
): Order | undefined {
    const alert = index.get(orderId);
    if (!alert) return undefined;
    return alert.twins.find(twin => isCommittedStatus(twin.status));
}

/**
 * The range of orders the index needs to see to be correct for `window`.
 *
 * `buildDuplicateWindowIndex` was written when the page held every order, and
 * it assumes as much. Since the fetch narrowed to the merchant's date filter,
 * the default "Today" view loads one day — and a twin placed yesterday evening
 * never meets the order it duplicates. A missing banner reads as "no
 * duplicate", which is the one thing a safety banner must never say falsely.
 *
 * A twin can only fall within `DUPLICATE_WINDOW_HOURS` of the order it pairs
 * with, so widening the visible window by that much on each side is exactly
 * enough: nothing outside it can change any visible order's alert. `null` (the
 * complete set is already loaded) needs no widening.
 */
export function duplicateCandidateWindow(window: OrderWindow): OrderWindow {
    if (!window) return null;
    const fromInstant = window.fromInstant - WINDOW_MS;
    const toInstant = window.toInstant + WINDOW_MS;
    // The day bounds feed `findWindow`'s scheduled_date half. Widening them to
    // the same instants keeps the margin a strict superset of the visible
    // window, so no visible row is ever missing from the merged index.
    return { fromInstant, toInstant, fromDay: baghdadDayKey(fromInstant), toDay: baghdadDayKey(toInstant) };
}

/**
 * Which duplicate guard, if any, a status change has to pass.
 *
 * Both are the same money question — a second courier for one customer inside
 * 48h — asked at the two moments it can still be stopped: committing the order
 * (`confirmed`) and handing it to the courier (`in_transit`). Every other
 * status costs nothing to duplicate.
 */
export type DuplicateGuardAction = "confirm" | "dispatch";

export function duplicateGuardFor(status: OrderStatus): DuplicateGuardAction | null {
    if (status === "confirmed") return "confirm";
    if (status === "in_transit") return "dispatch";
    return null;
}

export interface DuplicateDispatchPair {
    order: Order;
    twin: Order;
}

/**
 * The orders among `orderIds` that would become a customer's second committed
 * shipment, each paired with the committed twin it collides with. Ids that are
 * not loaded are skipped — the guard can only speak for orders it can see.
 */
export function findDuplicateDispatchPairs(
    orderIds: Iterable<string>,
    ordersById: ReadonlyMap<string, Order>,
    getCommittedTwin: (orderId: string) => Order | undefined,
): DuplicateDispatchPair[] {
    const pairs: DuplicateDispatchPair[] = [];
    for (const id of orderIds) {
        const order = ordersById.get(id);
        const twin = order ? getCommittedTwin(id) : undefined;
        if (order && twin) pairs.push({ order, twin });
    }
    return pairs;
}
