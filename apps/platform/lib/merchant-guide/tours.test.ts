import { describe, expect, it } from "vitest";
import { translations } from "@/lib/i18n";
import { GUIDE_LINES } from "./script";
import {
    STAFF_TOUR_STOPS,
    TOUR_PHASES,
    nextTourStop,
    phaseAvailable,
    phaseStops,
    seeStop,
    tourOfferFor,
    type GuideShopFacts,
} from "./tours";

const plain: GuideShopFacts = { staff: false, inShop: false, primeLinked: false, adsLinked: false };
const phase = (id: string) => {
    const p = TOUR_PHASES.find((x) => x.id === id);
    if (!p) throw new Error(id);
    return p;
};

describe("which phases and stops a shop gets", () => {
    it("team and till only for shops that said so", () => {
        expect(phaseAvailable(phase("team"), plain)).toBe(false);
        expect(phaseAvailable(phase("team"), { ...plain, staff: true })).toBe(true);
        expect(phaseAvailable(phase("till"), plain)).toBe(false);
        expect(phaseAvailable(phase("till"), { ...plain, inShop: true })).toBe(true);
    });

    it("courier asks to link Prime when not linked, and teaches Prime on Orders once linked", () => {
        expect(phaseStops(phase("courier"), plain).map((s) => s.id)).toEqual(["request"]);
        expect(phaseStops(phase("courier"), { ...plain, primeLinked: true }).map((s) => s.id)).toEqual(["queues", "strip"]);
        expect(phaseStops(phase("courier"), { ...plain, primeLinked: true }).every((s) => s.path === "/orders")).toBe(true);
    });

    it("the ads stop only for shops with Meta ads linked", () => {
        expect(phaseStops(phase("customers"), plain).map((s) => s.id)).toEqual(["groups", "reports"]);
        expect(phaseStops(phase("customers"), { ...plain, adsLinked: true }).map((s) => s.id)).toEqual(["groups", "ads", "reports"]);
    });
});

describe("walking a phase", () => {
    it("moves stop by stop and is done after the last", () => {
        const stops = phaseStops(phase("money"), plain);
        let record = seeStop(stops, { started_at: "x", seen: [] }, "numbers", "t1");
        expect(nextTourStop(stops, record)?.id).toBe("cash");
        expect(record.done_at).toBeUndefined();
        record = seeStop(stops, record, "cash", "t2");
        record = seeStop(stops, record, "expense", "t3");
        expect(nextTourStop(stops, record)).toBeNull();
        expect(record.done_at).toBe("t3");
    });
});

describe("first-visit offers", () => {
    it("offers a page's phase once, never after Later, start or done", () => {
        expect(tourOfferFor("/products", {}, plain)?.id).toBe("products");
        expect(tourOfferFor("/products", { products: { later_at: "x" } }, plain)).toBeNull();
        expect(tourOfferFor("/products", { products: { started_at: "x" } }, plain)).toBeNull();
        expect(tourOfferFor("/settings", {}, plain)).toBeNull();
        expect(tourOfferFor("/settings", {}, { ...plain, staff: true })?.id).toBe("team");
        expect(tourOfferFor("/dashboard", {}, plain)).toBeNull();
    });
});

describe("words", () => {
    it("every stop speaks a real line and has its labels in both languages", () => {
        const stops = [...TOUR_PHASES.flatMap((p) => p.stops), ...STAFF_TOUR_STOPS];
        for (const stop of stops) {
            expect(GUIDE_LINES).toHaveProperty(stop.line);
            for (const locale of ["ar", "en"] as const) expect(translations[locale]).toHaveProperty(stop.labelKey);
        }
        for (const p of TOUR_PHASES) for (const locale of ["ar", "en"] as const) expect(translations[locale]).toHaveProperty(p.labelKey);
    });
});
