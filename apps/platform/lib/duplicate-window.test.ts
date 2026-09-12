import { describe, it, expect } from "vitest";
import type { Order, OrderStatus } from "@/types/order";
import { buildDuplicateWindowIndex, committedTwinBlockingConfirm } from "./duplicate-window";

const BASE = "2026-09-11T10:00:00.000Z";

function hoursFrom(base: string, hours: number): string {
    return new Date(new Date(base).getTime() + hours * 3600_000).toISOString();
}

function order(overrides: Partial<Order> & { id: string }): Order {
    return {
        created_at: BASE,
        order_id: overrides.id,
        customer_name: "علي",
        phone: "07802301677",
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
            order({ id: "a", phone: "07802301677" }),
            order({ id: "b", phone: "07712345678" }),
        ]);
        expect(index.size).toBe(0);
    });
});

describe("buildDuplicateWindowIndex — phone normalization", () => {
    it("collapses +964 / 964 / leading-zero / Arabic-Indic forms", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "local", phone: "07802301677" }),
            order({ id: "e164", phone: "+9647802301677" }),
            order({ id: "cc", phone: "9647802301677" }),
            order({ id: "arabic", phone: "٠٧٨٠٢٣٠١٦٧٧" }),
        ]);
        expect(index.get("local")?.twins).toHaveLength(3);
    });

    it("ignores spacing and dashes", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", phone: "0780 230 1677" }),
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
        phone: "07802301677",
        secondary_phone: "07811262261",
        status: "confirmed",
        created_at: "2026-09-11T07:09:38.123Z",
        price: 43000,
    });
    const contactedOne = order({
        id: "live-2",
        order_id: "3260911002",
        phone: "07802301677",
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
            phone: "07802301677",
            secondary_phone: "07811262261",
            status: "confirmed",
            created_at: "2026-09-11T09:05:22.617Z",
        });
        const b = order({
            id: "b",
            order_id: "3260911003",
            phone: "07811262261",
            secondary_phone: "07802301677",
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
        const a = order({ id: "a", phone: "07802301677", secondary_phone: undefined });
        const b = order({ id: "b", phone: "07712345678", secondary_phone: "07802301677" });

        const index = buildDuplicateWindowIndex([a, b]);
        expect(index.get("a")?.primary.id).toBe("b");
        // b leads with a different number, so a's banner must name the shared one.
        expect(index.get("a")?.matchedOnPrimary).toBe(false);
        expect(index.get("b")?.matchedOnPrimary).toBe(false);
        expect(index.get("b")?.sharedNumber).toBe("7802301677");
    });

    it("matches on a shared secondary alone", () => {
        const a = order({ id: "a", phone: "07712345678", secondary_phone: "07802301677" });
        const b = order({ id: "b", phone: "07733333333", secondary_phone: "07802301677" });

        const index = buildDuplicateWindowIndex([a, b]);
        expect(index.get("a")?.primary.id).toBe("b");
        expect(index.get("a")?.matchedOnPrimary).toBe(false);
    });

    it("counts a twin once even when both numbers match", () => {
        const a = order({ id: "a", phone: "07802301677", secondary_phone: "07811262261" });
        const b = order({ id: "b", phone: "07802301677", secondary_phone: "07811262261" });

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
        const a = order({ id: "a", phone: "07802301677", secondary_phone: "07811262261" });
        const b = order({
            id: "b",
            phone: "07811262261",
            secondary_phone: "07802301677",
            created_at: hoursFrom(BASE, 72),
        });

        expect(buildDuplicateWindowIndex([a, b]).size).toBe(0);
    });
});

describe("matchedOnPrimary", () => {
    it("is true only when both orders lead with the shared number", () => {
        const index = buildDuplicateWindowIndex([
            order({ id: "a", phone: "07802301677" }),
            order({ id: "b", phone: "07802301677" }),
        ]);
        expect(index.get("a")?.matchedOnPrimary).toBe(true);
    });

    it("is false when the two orders hold the same pair in opposite slots", () => {
        // The shared number is a's primary but b's secondary — b's card shows a
        // different lead number, so the match needs explaining.
        const index = buildDuplicateWindowIndex([
            order({ id: "a", phone: "07802301677", secondary_phone: "07811262261" }),
            order({ id: "b", phone: "07811262261", secondary_phone: "07802301677" }),
        ]);
        expect(index.get("a")?.matchedOnPrimary).toBe(false);
        expect(index.get("b")?.matchedOnPrimary).toBe(false);
    });
});
