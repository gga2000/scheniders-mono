import { describe, expect, it } from "vitest";
import {
    actorKind,
    buildActivityFeed,
    buildJourney,
    buildSummary,
    dayLabel,
    filterCounts,
    formatDuration,
    groupByBaghdadDay,
    orderActivitySchema,
    parseLegacyEditNote,
    type RawActivityEvent,
} from "./order-activity";

const at = (hhmm: string, day = "2026-11-03") => new Date(`${day}T${hhmm}:00.000Z`).toISOString();

const raw: RawActivityEvent[] = [
    { id: "c", type: "status", at: at("16:02"), actor: "Automation", from: null, to: "new", notes: "Order Created" },
    { id: "w", type: "whatsapp", at: at("16:03"), actor: "Automation", data: { template: "cod_order_confirm", sent_at: at("16:03"), delivered_at: at("16:03"), read_at: at("16:09"), failed_at: null, reason: null } },
    { id: "s1", type: "status", at: at("16:19"), actor: "whatsapp_bot", from: "new", to: "confirmed", notes: null },
    { id: "e", type: "edit", at: at("16:46"), actor: "Mohammed", data: { fields: [{ f: "customer_name", old: "راندي", new: "زبون - البصرة" }] } },
    { id: "legacy", type: "status", at: at("16:47"), actor: "Mohammed", from: "confirmed", to: "confirmed", notes: "Updated: Secondary Phone: None → None, Internal Notes: None → None" },
    { id: "p", type: "label_printed", at: at("17:10"), actor: "Mohammed", data: { count: 1 } },
    { id: "s2", type: "status", at: at("17:12"), actor: "Mohammed", from: "confirmed", to: "in_transit", notes: null },
];

describe("parseLegacyEditNote", () => {
    it("maps the English labels back to fields and drops None → None", () => {
        expect(parseLegacyEditNote("Updated: Name: راندي → زبون - البصرة, Secondary Phone: None → None, Internal Notes: None → None"))
            .toEqual([{ f: "customer_name", old: "راندي", new: "زبون - البصرة" }]);
    });

    it("keeps commas inside a value", () => {
        expect(parseLegacyEditNote("Updated: Address: البصرة, الجزائر → البصرة, Price: 1000 → 2000"))
            .toEqual([
                { f: "address", old: "البصرة, الجزائر", new: "البصرة" },
                { f: "price", old: "1000", new: "2000" },
            ]);
    });

    it("keeps an unknown piece as raw text and reads Items updated", () => {
        expect(parseLegacyEditNote("Updated: Colour: red → blue, Items updated"))
            .toEqual([{ f: "raw", old: null, new: "Colour: red → blue" }, { f: "items", old: null, new: null }]);
    });
});

describe("buildActivityFeed", () => {
    const feed = buildActivityFeed(raw);

    it("is newest first, turns the creation row into created and hides a no-op legacy edit", () => {
        expect(feed.map((e) => e.kind)).toEqual(["status", "label_printed", "edit", "status", "whatsapp", "created"]);
    });

    it("says how long the order sat in the status it left", () => {
        const confirmed = feed.find((e) => e.id === "s1");
        const transit = feed.find((e) => e.id === "s2");
        expect(confirmed?.kind === "status" && confirmed.stayedMs).toBe(17 * 60_000);
        expect(transit?.kind === "status" && transit.stayedMs).toBe(53 * 60_000);
    });

    it("rolls WhatsApp up to its furthest state", () => {
        const wa = feed.find((e) => e.kind === "whatsapp");
        expect(wa?.kind === "whatsapp" && wa.state).toBe("read");
    });

    it("counts each filter", () => {
        expect(filterCounts(feed)).toEqual({ all: 6, status: 3, edits: 1, whatsapp: 1, delivery: 1, notes: 0 });
    });
});

describe("actorKind", () => {
    it("tells people from machines", () => {
        expect(actorKind("Mohammed")).toBe("staff");
        expect(actorKind("whatsapp_bot")).toBe("automation");
        expect(actorKind("System")).toBe("automation");
        expect(actorKind(null)).toBe("automation");
        expect(actorKind("Claude Claude")).toBe("claude");
        expect(actorKind("Prime")).toBe("courier");
        expect(actorKind("Customer")).toBe("customer");
    });
});

describe("buildJourney", () => {
    const feed = buildActivityFeed(raw);

    it("marks reached steps with their first time and the current one", () => {
        const steps = buildJourney("in_transit", false, feed, at("16:02"));
        expect(steps.map((s) => [s.status, s.state, s.at])).toEqual([
            ["new", "done", at("16:02")],
            ["confirmed", "done", at("16:19")],
            ["in_transit", "current", at("17:12")],
            ["delivered", "upcoming", null],
            ["completed", "upcoming", null],
        ]);
    });

    it("ends on a stopped step when the order was cancelled", () => {
        const cancelled = buildActivityFeed([...raw, { id: "x", type: "status", at: at("18:00"), actor: "Ali", from: "in_transit", to: "cancelled", notes: null }]);
        const steps = buildJourney("cancelled", false, cancelled, at("16:02"));
        expect(steps.map((s) => `${s.status}:${s.state}`)).toEqual(["new:done", "confirmed:done", "in_transit:done", "cancelled:stopped"]);
    });

    it("shows an open detour as current and keeps the rest upcoming", () => {
        const steps = buildJourney("contacted", false, buildActivityFeed(raw.slice(0, 1)), at("16:02"));
        expect(steps.map((s) => `${s.status}:${s.state}`)).toEqual(["new:done", "contacted:current", "confirmed:upcoming", "in_transit:upcoming", "delivered:upcoming", "completed:upcoming"]);
    });

    it("marks the last step done, not current, when the order is completed", () => {
        const steps = buildJourney("completed", false, [], at("16:02"));
        expect(steps[steps.length - 1].state).toBe("done");
    });
});

describe("buildSummary", () => {
    it("measures age, time to confirm, time out with the courier and who did most", () => {
        const now = Date.parse(at("17:40"));
        const s = buildSummary("in_transit", at("16:02"), buildActivityFeed(raw), now);
        expect(s.ageMs).toBe(98 * 60_000);
        expect(s.toConfirmMs).toBe(17 * 60_000);
        expect(s.deliveryMs).toBe(28 * 60_000);
        expect(s.deliveryOpen).toBe(true);
        expect(s.topActor).toEqual({ name: "Mohammed", count: 3 });
    });
});

describe("grouping and labels", () => {
    it("groups by Baghdad day, not UTC", () => {
        const feed = buildActivityFeed([
            { id: "a", type: "note", at: "2026-11-03T22:30:00.000Z", actor: "Noor", text: "late" },
            { id: "b", type: "note", at: "2026-11-03T20:30:00.000Z", actor: "Noor", text: "early" },
        ]);
        expect(groupByBaghdadDay(feed).map((g) => g.day)).toEqual(["2026-11-04", "2026-11-03"]);
    });

    it("names today and yesterday", () => {
        const now = Date.parse("2026-11-03T12:00:00.000Z");
        expect(dayLabel("2026-11-03", now)).toEqual({ kind: "today" });
        expect(dayLabel("2026-11-02", now)).toEqual({ kind: "yesterday" });
        expect(dayLabel("2026-10-30", now)).toEqual({ kind: "date", day: "2026-10-30" });
    });

    it("formats durations in both languages", () => {
        expect(formatDuration(17 * 60_000, "en")).toBe("17m");
        expect(formatDuration(68 * 60_000, "en")).toBe("1h 08m");
        expect(formatDuration((26 * 60 + 5) * 60_000, "ar")).toBe("1 ي 2 س");
        expect(formatDuration(10_000, "ar")).toBe("أقل من دقيقة");
    });
});

describe("orderActivitySchema", () => {
    it("drops a row it does not know instead of failing the whole feed", () => {
        const parsed = orderActivitySchema.parse({
            order: { created_at: at("16:02"), source: "storefront", created_via: null, entered_by: null, price: 34750, items: "انفوي", pieces: 1, is_replacement: false, is_return: false, original: null },
            events: [{ id: "x", type: "something_new", at: at("16:02") }, raw[0]],
        });
        expect(parsed.events).toHaveLength(1);
    });
});
