import { describe, it, expect } from "vitest";
import type { Order, OrderStatus } from "@/types/order";
import { windowFromDateFilter } from "@/lib/order-window";
import {
    buildDuplicateWindowIndex,
    committedTwinBlockingConfirm,
    duplicateCandidateWindow,
    duplicateGuardFor,
    compareTwinsFor,
    findDuplicateDispatchPairs,
    DUPLICATE_WINDOW_HOURS,
} from "./duplicate-window";

const BASE = "2026-09-11T10:00:00.000Z";

function hoursFrom(base: string, hours: number): string {
    return new Date(new Date(base).getTime() + hours * 3600_000).toISOString();
}

function order(overrides: Partial<Order> & { id: string }): Order {
    return {
        created_at: BASE,
        order_id: overrides.id,
        customer_name: "علي",
        phone: "07801234567",
        items: [{ name: "عطر فولاريس", quantity: 1, price: 43000 }],
        price: 43000,
        status: "new",
        priority: "normal",
        payment_status: "cod",
        is_return: false,
        is_replacement: false,
        is_archived: false,
        ...overrides,
    } as Order;
}

describe("buildDuplicateWindowIndex — window", () => {
    it("flags both orders of a same-minute pair", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a" }),
            order({ id: "b" }),
        ]);
        expect(index.get("a")?.primary.id).toBe("b");
        expect(index.get("b")?.primary.id).toBe("a");
    });

    it("flags at 47h59m and stops at 48h01m", () => {
        const inside = buildDuplicateWindowIndex([
            order({ id: "a" }),
            order({ id: "b", created_at: hoursFrom(BASE, 47 + 59 / 60) }),
        ]);
        expect(inside.has("a")).toBe(true);

        const outside = buildDuplicateWindowIndex([
            order({ id: "a" }),
            order({ id: "b", created_at: hoursFrom(BASE, 48 + 1 / 60) }),
        ]);
        expect(outside.size).toBe(0);
    });

    it("reports the gap to the named twin", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a" }),
            order({ id: "b", created_at: hoursFrom(BASE, 3) }),
        ]);
        expect(index.get("a")?.gapMinutes).toBe(180);
    });

    it("a lone order never flags", () => {
        expect(buildDuplicateWindowIndex([order({ id: "a" })]).size).toBe(0);
    });
});

describe("buildDuplicateWindowIndex — sameDay labelling", () => {
    it("is true within one Baghdad day", () => {
        // 07:00Z and 19:00Z are both 11 Sep in Baghdad (UTC+3).
        const index = buildDuplicateWindowIndex([
            order({ id: "a", created_at: "2026-09-11T07:00:00.000Z" }),
            order({ id: "b", created_at: "2026-09-11T19:00:00.000Z" }),
        ]);
        expect(index.get("a")?.sameDay).toBe(true);
    });

    it("is false across Baghdad midnight even a few hours apart", () => {
        // 22:00Z is 12 Sep 01:00 in Baghdad; 20:00Z is still 11 Sep.
        const index = buildDuplicateWindowIndex([
            order({ id: "a", created_at: "2026-09-11T20:00:00.000Z" }),
            order({ id: "b", created_at: "2026-09-11T22:00:00.000Z" }),
        ]);
        expect(index.get("a")?.sameDay).toBe(false);
        expect(index.get("a")?.gapMinutes).toBe(120);
    });
});

describe("buildDuplicateWindowIndex — severity", () => {
    const committed: OrderStatus[] = ["confirmed", "in_transit", "delivered", "completed"];

    it.each(committed)("both %s → critical", status => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", status }),
            order({ id: "b", status }),
        ]);
        expect(index.get("a")?.severity).toBe("critical");
        expect(index.get("b")?.severity).toBe("critical");
    });

    it("confirmed + new → warning on both sides", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", status: "confirmed" }),
            order({ id: "b", status: "new" }),
        ]);
        expect(index.get("a")?.severity).toBe("warning");
        expect(index.get("b")?.severity).toBe("warning");
    });

    it("two uncommitted orders → warning", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", status: "new" }),
            order({ id: "b", status: "contacted" }),
        ]);
        expect(index.get("a")?.severity).toBe("warning");
    });

    it("escalates on a farther committed twin, not the closest one", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "subject", status: "confirmed" }),
            order({ id: "close-new", status: "new", created_at: hoursFrom(BASE, 1) }),
            order({ id: "far-confirmed", status: "confirmed", created_at: hoursFrom(BASE, 5) }),
        ]);
        const alert = index.get("subject");
        expect(alert?.severity).toBe("critical");
        // The banner must name the expensive twin, so its gap belongs to that one.
        expect(alert?.primary.id).toBe("far-confirmed");
        expect(alert?.gapMinutes).toBe(300);
        expect(alert?.twins).toHaveLength(2);
    });

    it("names the closest twin when only a warning", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "subject", status: "new" }),
            order({ id: "close", status: "new", created_at: hoursFrom(BASE, 1) }),
            order({ id: "far", status: "new", created_at: hoursFrom(BASE, 5) }),
        ]);
        expect(index.get("subject")?.primary.id).toBe("close");
    });
});

describe("buildDuplicateWindowIndex — exclusions", () => {
    it("ignores cancelled and rejected twins", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", status: "confirmed" }),
            order({ id: "b", status: "cancelled" }),
            order({ id: "c", status: "rejected" }),
        ]);
        expect(index.size).toBe(0);
    });

    it("ignores returns and archived orders", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a" }),
            order({ id: "b", is_return: true }),
            order({ id: "c", is_archived: true }),
        ]);
        expect(index.size).toBe(0);
    });

    it("suppresses an order the merchant marked as a verified customer", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", is_verified_customer: true }),
            order({ id: "b" }),
        ]);
        expect(index.has("a")).toBe(false);
        // The other side still sees it — the mark is per order, as it is today.
        expect(index.get("b")?.primary.id).toBe("a");
    });

    it("never groups orders with no usable phone", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", phone: "" }),
            order({ id: "b", phone: "   " }),
        ]);
        expect(index.size).toBe(0);
    });

    it("does not group two different customers", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", phone: "07801234567" }),
            order({ id: "b", phone: "07712345678" }),
        ]);
        expect(index.size).toBe(0);
    });
});

describe("buildDuplicateWindowIndex — phone normalization", () => {
    it("collapses +964 / 964 / leading-zero / Arabic-Indic forms", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "local", phone: "07801234567" }),
            order({ id: "e164", phone: "+9647801234567" }),
            order({ id: "cc", phone: "9647801234567" }),
            order({ id: "arabic", phone: "٠٧٨٠٢٣٠١٦٧٧" }),
        ]);
        expect(index.get("local")?.twins).toHaveLength(3);
    });

    it("ignores spacing and dashes", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", phone: "0780 123 4567" }),
            order({ id: "b", phone: "0780-230-1677" }),
        ]);
        expect(index.get("a")?.primary.id).toBe("b");
    });
});

describe("committedTwinBlockingConfirm", () => {
    it("returns the committed twin that makes confirming a double-dispatch", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "subject", status: "contacted" }),
            order({ id: "twin", status: "confirmed", created_at: hoursFrom(BASE, 2) }),
        ]);
        expect(committedTwinBlockingConfirm("subject", index)?.id).toBe("twin");
    });

    it("returns nothing when the twin is not committed", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "subject", status: "contacted" }),
            order({ id: "twin", status: "new" }),
        ]);
        expect(committedTwinBlockingConfirm("subject", index)).toBeUndefined();
    });

    it("returns nothing for an order with no alert at all", () => {
        const index = buildDuplicateWindowIndex([order({ id: "lonely" })]);
        expect(committedTwinBlockingConfirm("lonely", index)).toBeUndefined();
    });
});

// Real rows pulled from the live order book on 2026-09-11 — the pair that prompted
// this feature. Same phone, 21 seconds apart, one already confirmed.
describe("live scenario — orders 3260911001 / 3260911002", () => {
    const confirmedOne = order({
        id: "live-1",
        order_id: "3260911001",
        phone: "07801234567",
        secondary_phone: "07811262261",
        status: "confirmed",
        created_at: "2026-09-11T07:09:38.123Z",
        price: 43000,
    });
    const contactedOne = order({
        id: "live-2",
        order_id: "3260911002",
        phone: "07801234567",
        secondary_phone: "07811262261",
        status: "contacted",
        created_at: "2026-09-11T07:09:59.786Z",
        price: 43000,
    });

    it("flags both sides as same-day, zero-minute gap", () => {
        const index = buildDuplicateWindowIndex([confirmedOne, contactedOne]);
        expect(index.get("live-1")?.sameDay).toBe(true);
        expect(index.get("live-1")?.gapMinutes).toBe(0);
        expect(index.get("live-2")?.primary.order_id).toBe("3260911001");
    });

    it("is only a warning while one side is still contacted", () => {
        const index = buildDuplicateWindowIndex([confirmedOne, contactedOne]);
        expect(index.get("live-1")?.severity).toBe("warning");
        expect(index.get("live-2")?.severity).toBe("warning");
    });

    it("blocks confirming the second one, naming the already-confirmed twin", () => {
        const index = buildDuplicateWindowIndex([confirmedOne, contactedOne]);
        expect(committedTwinBlockingConfirm("live-2", index)?.order_id).toBe("3260911001");
    });

    it("escalates to critical once both are confirmed", () => {
        const index = buildDuplicateWindowIndex([
            confirmedOne,
            { ...contactedOne, status: "confirmed" as const },
        ]);
        expect(index.get("live-1")?.severity).toBe("critical");
        expect(index.get("live-2")?.severity).toBe("critical");
    });
});

describe("buildDuplicateWindowIndex — matching across both numbers", () => {
    it("catches the same pair of numbers held in opposite slots", () => {
        // Exactly the miss reported on 2026-09-11: an agent swapped the two numbers
        // on one order, so keying on the primary alone put them in separate groups.
        const a = order({
            id: "a",
            order_id: "3260911004",
            phone: "07801234567",
            secondary_phone: "07811262261",
            status: "confirmed",
            created_at: "2026-09-11T09:05:22.617Z",
        });
        const b = order({
            id: "b",
            order_id: "3260911003",
            phone: "07811262261",
            secondary_phone: "07801234567",
            status: "confirmed",
            created_at: "2026-09-11T08:15:55.856Z",
        });

        const index = buildDuplicateWindowIndex([a, b]);
        expect(index.get("a")?.primary.order_id).toBe("3260911003");
        expect(index.get("a")?.severity).toBe("critical");
        // 08:15:55 -> 09:05:22 is 49m27s.
        expect(index.get("a")?.gapMinutes).toBe(49);
        expect(index.get("b")?.primary.order_id).toBe("3260911004");
    });

    it("matches when only the secondary of one meets the primary of the other", () => {
        const a = order({ id: "a", phone: "07801234567", secondary_phone: undefined });
        const b = order({ id: "b", phone: "07712345678", secondary_phone: "07801234567" });

        const index = buildDuplicateWindowIndex([a, b]);
        expect(index.get("a")?.primary.id).toBe("b");
        // b leads with a different number, so a's banner must name the shared one.
        expect(index.get("a")?.matchedOnPrimary).toBe(false);
        expect(index.get("b")?.matchedOnPrimary).toBe(false);
        expect(index.get("b")?.sharedNumber).toBe("7801234567");
    });

    it("matches on a shared secondary alone", () => {
        const a = order({ id: "a", phone: "07712345678", secondary_phone: "07801234567" });
        const b = order({ id: "b", phone: "07733333333", secondary_phone: "07801234567" });

        const index = buildDuplicateWindowIndex([a, b]);
        expect(index.get("a")?.primary.id).toBe("b");
        expect(index.get("a")?.matchedOnPrimary).toBe(false);
    });

    it("counts a twin once even when both numbers match", () => {
        const a = order({ id: "a", phone: "07801234567", secondary_phone: "07811262261" });
        const b = order({ id: "b", phone: "07801234567", secondary_phone: "07811262261" });

        expect(buildDuplicateWindowIndex([a, b]).get("a")?.twins).toHaveLength(1);
    });

    it("does not chain two unrelated orders through a middleman", () => {
        // A shares a line with B, B shares a different line with C. A and C have
        // nothing in common and must not be married to each other.
        const a = order({ id: "a", phone: "07700000001", secondary_phone: "07700000002" });
        const b = order({ id: "b", phone: "07700000002", secondary_phone: "07700000003" });
        const c = order({ id: "c", phone: "07700000003", secondary_phone: "07700000004" });

        const index = buildDuplicateWindowIndex([a, b, c]);
        expect(index.get("a")?.twins.map(t => t.id)).toEqual(["b"]);
        expect(index.get("c")?.twins.map(t => t.id)).toEqual(["b"]);
        expect(index.get("b")?.twins.map(t => t.id).sort()).toEqual(["a", "c"]);
    });

    it("still ignores an order whose only shared number sits outside the window", () => {
        const a = order({ id: "a", phone: "07801234567", secondary_phone: "07811262261" });
        const b = order({
            id: "b",
            phone: "07811262261",
            secondary_phone: "07801234567",
            created_at: hoursFrom(BASE, 72),
        });

        expect(buildDuplicateWindowIndex([a, b]).size).toBe(0);
    });
});

describe("matchedOnPrimary", () => {
    it("is true only when both orders lead with the shared number", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", phone: "07801234567" }),
            order({ id: "b", phone: "07801234567" }),
        ]);
        expect(index.get("a")?.matchedOnPrimary).toBe(true);
    });

    it("is false when the two orders hold the same pair in opposite slots", () => {
        // The shared number is a's primary but b's secondary — b's card shows a
        // different lead number, so the match needs explaining.
        const index = buildDuplicateWindowIndex([
            order({ id: "a", phone: "07801234567", secondary_phone: "07811262261" }),
            order({ id: "b", phone: "07811262261", secondary_phone: "07801234567" }),
        ]);
        expect(index.get("a")?.matchedOnPrimary).toBe(false);
        expect(index.get("b")?.matchedOnPrimary).toBe(false);
    });
});

describe("duplicateCandidateWindow", () => {
    const HOUR = 60 * 60 * 1000;

    it("needs no widening when the complete set is loaded", () => {
        expect(duplicateCandidateWindow(null)).toBeNull();
    });

    it("widens a windowed view by exactly the duplicate window on each side", () => {
        const day = windowFromDateFilter("2026-10-04", "2026-10-04");
        expect(duplicateCandidateWindow(day)).toEqual({
            fromInstant: day!.fromInstant - DUPLICATE_WINDOW_HOURS * HOUR,
            toInstant: day!.toInstant + DUPLICATE_WINDOW_HOURS * HOUR,
            // Baghdad days, widened by the same two days on each side.
            fromDay: "2026-10-02",
            toDay: "2026-10-06",
        });
    });

    it("finds a twin from yesterday that the Today view alone would miss", () => {
        // The case the widening exists for. Today's order is confirmed; its twin
        // was placed and confirmed the previous evening, outside today's window.
        const todayStart = Date.parse("2026-10-04T00:00:00+03:00");
        const today = windowFromDateFilter("2026-10-04", "2026-10-04");
        expect(today!.fromInstant).toBe(todayStart);
        const yesterdayEvening = new Date(todayStart - 3 * HOUR).toISOString();
        const thisMorning = new Date(todayStart + 2 * HOUR).toISOString();

        const visible = order({ id: "today", status: "confirmed", created_at: thisMorning });
        const twin = order({ id: "yesterday", status: "confirmed", created_at: yesterdayEvening });

        // Only today's rows loaded: no alert — the blind spot.
        expect(buildDuplicateWindowIndex([visible]).get("today")).toBeUndefined();

        // The widened range covers the twin, so it is fetched and found.
        const range = duplicateCandidateWindow(today)!;
        expect(Date.parse(yesterdayEvening)).toBeGreaterThanOrEqual(range.fromInstant);
        const alert = buildDuplicateWindowIndex([visible, twin]).get("today");
        expect(alert?.primary.id).toBe("yesterday");
        expect(alert?.severity).toBe("critical");
    });
});

describe("duplicateGuardFor", () => {
    it("guards committing and dispatching, nothing else", () => {
        expect(duplicateGuardFor("confirmed")).toBe("confirm");
        expect(duplicateGuardFor("in_transit")).toBe("dispatch");
        for (const status of ["new", "contacted", "delivered", "completed", "cancelled", "rejected"] as OrderStatus[]) {
            expect(duplicateGuardFor(status)).toBeNull();
        }
    });
});

describe("findDuplicateDispatchPairs — the 48h dispatch warning", () => {
    const pairsFor = (orders: Order[], ids: string[]) => {
        const index = buildDuplicateWindowIndex(orders);
        return findDuplicateDispatchPairs(
            ids,
            new Map(orders.map(o => [o.id, o])),
            id => committedTwinBlockingConfirm(id, index),
        );
    };

    it("warns when shipping an order whose twin is already shipped", () => {
        const shipped = order({ id: "shipped", status: "in_transit", created_at: hoursFrom(BASE, -20) });
        const ready = order({ id: "ready", status: "confirmed" });

        const pairs = pairsFor([shipped, ready], ["ready"]);

        expect(pairs).toHaveLength(1);
        expect(pairs[0].order.id).toBe("ready");
        expect(pairs[0].twin.id).toBe("shipped");
    });

    it("flags both halves when the two twins are shipped in the same batch", () => {
        const a = order({ id: "a", status: "confirmed" });
        const b = order({ id: "b", status: "confirmed", created_at: hoursFrom(BASE, 3) });

        expect(pairsFor([a, b], ["a", "b"]).map(p => p.order.id)).toEqual(["a", "b"]);
    });

    it("stays quiet when the twin is uncommitted or cancelled", () => {
        const ready = order({ id: "ready", status: "confirmed" });
        const pending = order({ id: "pending", status: "new", created_at: hoursFrom(BASE, -2) });
        const dead = order({ id: "dead", status: "cancelled", created_at: hoursFrom(BASE, -1) });

        expect(pairsFor([ready, pending, dead], ["ready"])).toEqual([]);
    });

    it("stays quiet once the twin is more than 48h away", () => {
        const old = order({ id: "old", status: "delivered", created_at: hoursFrom(BASE, -49) });
        const ready = order({ id: "ready", status: "confirmed" });

        expect(pairsFor([old, ready], ["ready"])).toEqual([]);
    });

    it("skips ids that are not loaded instead of guessing", () => {
        const ready = order({ id: "ready", status: "confirmed" });
        expect(pairsFor([ready], ["ready", "not-loaded"])).toEqual([]);
    });
});

describe("compareTwinsFor — what the compare modal lines up", () => {
    it("includes a margin twin the visible window never loaded", () => {
        const visible = order({ id: "today", status: "confirmed" });
        const yesterday = order({ id: "yesterday", status: "confirmed", created_at: hoursFrom(BASE, -20) });
        const candidates = [visible, yesterday];
        const alert = buildDuplicateWindowIndex(candidates).get("today");

        expect(compareTwinsFor(visible, candidates, alert).map(o => o.id)).toEqual(["yesterday"]);
    });

    it("adds a twin matched only through the secondary number", () => {
        const subject = order({ id: "s", phone: "07701112222", secondary_phone: "07801234567" });
        const twin = order({ id: "t", phone: "07801234567", created_at: hoursFrom(BASE, 1) });
        const alert = buildDuplicateWindowIndex([subject, twin]).get("s");

        expect(compareTwinsFor(subject, [subject, twin], alert).map(o => o.id)).toEqual(["t"]);
    });

    it("leaves out the order itself and returns", () => {
        const subject = order({ id: "s" });
        const ret = order({ id: "r", is_return: true });
        const older = order({ id: "o", created_at: hoursFrom(BASE, -200) });

        expect(compareTwinsFor(subject, [subject, ret, older], undefined).map(o => o.id)).toEqual(["o"]);
    });
});

describe("dismissal — is_verified_customer silences the pair", () => {
    it("drops the alert and the guard for orders the merchant marked legitimate", () => {
        const a = order({ id: "a", status: "confirmed", is_verified_customer: true });
        const b = order({ id: "b", status: "confirmed", is_verified_customer: true, created_at: hoursFrom(BASE, 1) });
        const index = buildDuplicateWindowIndex([a, b]);

        expect(index.get("a")).toBeUndefined();
        expect(committedTwinBlockingConfirm("b", index)).toBeUndefined();
    });

    it("still checks a NEW order from the same number after a dismissal", () => {
        const a = order({ id: "a", status: "confirmed", is_verified_customer: true });
        const fresh = order({ id: "fresh", status: "new", created_at: hoursFrom(BASE, 5) });
        const index = buildDuplicateWindowIndex([a, fresh]);

        expect(committedTwinBlockingConfirm("fresh", index)?.id).toBe("a");
    });
});
