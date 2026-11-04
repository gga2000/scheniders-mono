import { describe, expect, it } from "vitest";
import { bandFor, deliveryChance, type ChanceInput } from "./delivery-chance";
import type { ShieldNetwork } from "./types";

const NOW = new Date("2026-11-04T12:00:00Z");
const base: ChanceInput = {
    phone: "07701234567",
    status: "confirmed",
    createdAt: "2026-11-04T11:30:00Z", // 14:30 Baghdad
    addressDetails: "حي الجامعة قرب جامع الرحمن شارع 14",
    itemLines: 1,
    adChannel: "instagram",
    own: null,
    network: null,
    now: NOW,
};

const net = (band: ShieldNetwork["band"]): ShieldNetwork => ({
    phone: "7701234567", band, score: 70, confidence: "high", stores: 3, outcomes: 6,
    delivered: 1, delivered_stores: 1, bad: { refused: { count: 3, stores: 2 } }, sequence: ["D", "R", "R"],
    last_bad_orders_ago: 0, trend: "worsening",
});

describe("deliveryChance", () => {
    it("an impossible Iraqi number is red at 5%", () => {
        const r = deliveryChance({ ...base, phone: "0123" });
        expect(r).toMatchObject({ chance: 5, risk: 95, band: "red" });
        expect(r.reasons[0].key).toBe("invalidPhone");
    });

    it("a plain order sits near the store's usual delivery rate", () => {
        const r = deliveryChance(base);
        expect(r.chance).toBeGreaterThan(60);
        expect(r.band).toBe("green");
    });

    it("a red network record pulls the order into red with its reason first", () => {
        const r = deliveryChance({ ...base, network: net("red"), addressDetails: "بغداد" });
        expect(r.band).toBe("red");
        expect(r.reasons.map((x) => x.key)).toContain("networkRed");
        expect(r.reasons[0].effect).toBe("risk");
    });

    it("'none' from the network changes nothing", () => {
        expect(deliveryChance({ ...base, network: net("none") }).chance).toBe(deliveryChance(base).chance);
    });

    it("own refusals here lower the chance; own deliveries raise it", () => {
        const bad = deliveryChance({ ...base, own: { delivered: 0, refused: 2, noAnswer: 0 } });
        const good = deliveryChance({ ...base, own: { delivered: 3, refused: 0, noAnswer: 0 } });
        expect(bad.chance).toBeLessThan(deliveryChance(base).chance);
        expect(good.chance).toBeGreaterThan(deliveryChance(base).chance);
    });

    it("waiting for a first call only counts while the order is new", () => {
        const waitingNew = deliveryChance({ ...base, status: "new", createdAt: "2026-11-03T08:00:00Z" });
        const waitingConfirmed = deliveryChance({ ...base, createdAt: "2026-11-03T08:00:00Z" });
        expect(waitingNew.reasons.map((x) => x.key)).toContain("waited24h");
        expect(waitingConfirmed.reasons.map((x) => x.key)).not.toContain("waited24h");
    });

    it("night orders use Baghdad time", () => {
        // 22:30 UTC = 01:30 Baghdad
        const r = deliveryChance({ ...base, createdAt: "2026-11-03T22:30:00Z" });
        expect(r.reasons.map((x) => x.key)).toContain("nightOrder");
    });

    it("bands split at 35 and 60", () => {
        expect(bandFor(34)).toBe("green");
        expect(bandFor(35)).toBe("yellow");
        expect(bandFor(60)).toBe("red");
    });
});
