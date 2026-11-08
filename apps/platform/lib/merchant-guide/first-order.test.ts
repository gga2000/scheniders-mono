import { describe, expect, it } from "vitest";
import { translations } from "@/lib/i18n";
import { GUIDE_LINES } from "./script";
import {
    FIRST_ORDER_LATER_MS,
    FIRST_ORDER_PLACES,
    STATUS_WALK,
    firstOrderDoneCount,
    firstOrderView,
    nextFirstOrderStop,
    type PracticeOrder,
} from "./first-order";

const fresh: PracticeOrder[] = [
    { id: "a", status: "new", print_count: 0 },
    { id: "b", status: "new", print_count: 0 },
    { id: "c", status: "no_response", print_count: null },
];
const confirmed: PracticeOrder[] = [{ ...fresh[0], status: "confirmed" }, fresh[1], fresh[2]];
const printed: PracticeOrder[] = [{ ...confirmed[0], print_count: 1 }, fresh[1], fresh[2]];
const NOW = Date.parse("2026-11-08T20:00:00Z");

describe("nextFirstOrderStop", () => {
    it("walks statuses, confirm, WhatsApp, dispatch in order", () => {
        expect(nextFirstOrderStop({ started_at: "x" }, fresh)).toBe("statuses");
        expect(nextFirstOrderStop({ seen: ["statuses"] }, fresh)).toBe("confirm");
        expect(nextFirstOrderStop({ seen: ["statuses"] }, confirmed)).toBe("whatsapp");
        expect(nextFirstOrderStop({ seen: ["statuses", "whatsapp"] }, confirmed)).toBe("dispatch");
        expect(nextFirstOrderStop({ seen: ["statuses", "whatsapp"] }, printed)).toBeNull();
    });

    it("never skips an earlier stop because a later one is done", () => {
        expect(nextFirstOrderStop({}, printed)).toBe("statuses");
        expect(firstOrderDoneCount({}, printed)).toBe(2);
    });
});

describe("firstOrderView", () => {
    it("offers only on the Orders page, and a Later waits a day", () => {
        expect(firstOrderView(undefined, null, true, NOW)).toEqual({ kind: "offer" });
        expect(firstOrderView(undefined, null, false, NOW)).toEqual({ kind: "none" });
        const later = new Date(NOW - 60_000).toISOString();
        expect(firstOrderView({ later_at: later }, null, true, NOW)).toEqual({ kind: "none" });
        expect(firstOrderView({ later_at: later }, null, true, NOW + FIRST_ORDER_LATER_MS)).toEqual({ kind: "offer" });
    });

    it("shows nothing while the practice orders load, then the stop", () => {
        expect(firstOrderView({ started_at: "x" }, null, true, NOW)).toEqual({ kind: "none" });
        expect(firstOrderView({ started_at: "x" }, fresh, false, NOW)).toEqual({ kind: "stop", stop: "statuses" });
    });

    it("says when the practice orders ran out before the walk ended", () => {
        expect(firstOrderView({ started_at: "x", seen: ["statuses"] }, [], true, NOW)).toEqual({ kind: "expired" });
    });

    it("finishes once every stop ticks, and stays quiet after", () => {
        expect(firstOrderView({ started_at: "x", seen: ["statuses", "whatsapp"] }, printed, true, NOW)).toEqual({ kind: "finished" });
        expect(firstOrderView({ started_at: "x", done_at: "y" }, printed, true, NOW)).toEqual({ kind: "none" });
    });
});

describe("phase 2 words", () => {
    it("every stop speaks a real line and has its labels in both languages", () => {
        for (const place of Object.values(FIRST_ORDER_PLACES)) {
            expect(GUIDE_LINES).toHaveProperty(place.line);
            for (const locale of ["ar", "en"] as const) {
                expect(translations[locale]).toHaveProperty(place.labelKey);
                expect(translations[locale]).toHaveProperty(place.checkKey);
            }
        }
        for (const status of STATUS_WALK) {
            expect(translations.ar).toHaveProperty(`guide.fo.status.${status}`);
            expect(translations.ar).toHaveProperty(`orders.status.${status}`);
        }
    });
});
