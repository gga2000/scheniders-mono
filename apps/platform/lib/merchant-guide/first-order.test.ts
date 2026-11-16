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
    storeOrderPlaced,
    type FirstOrderFacts,
    type PracticeOrder,
} from "./first-order";

const fresh: PracticeOrder[] = [
    { id: "a", status: "new", print_count: 0, source: "manual" },
    { id: "b", status: "new", print_count: 0, source: "manual" },
    { id: "c", status: "no_response", print_count: null, source: "manual" },
];
const fromStore: PracticeOrder = { id: "s", status: "new", print_count: 0, source: "storefront" };
const ordered = [...fresh, fromStore];
const confirmed: PracticeOrder[] = [{ ...fresh[0], status: "confirmed" }, fresh[1], fresh[2], fromStore];
const printed: PracticeOrder[] = [{ ...confirmed[0], print_count: 1 }, fresh[1], fresh[2], fromStore];
const OFF: FirstOrderFacts = { autoSendOn: false, primeLinked: false };
const ON: FirstOrderFacts = { autoSendOn: true, primeLinked: true };
const NOW = Date.parse("2026-11-08T20:00:00Z");

describe("nextFirstOrderStop", () => {
    it("walks statuses, store order, confirm, WhatsApp, courier, dispatch in order", () => {
        expect(nextFirstOrderStop({ started_at: "x" }, fresh, OFF)).toBe("statuses");
        expect(nextFirstOrderStop({ seen: ["statuses"] }, fresh, OFF)).toBe("store_order");
        expect(nextFirstOrderStop({ seen: ["statuses"] }, ordered, OFF)).toBe("confirm");
        expect(nextFirstOrderStop({ seen: ["statuses"] }, confirmed, OFF)).toBe("whatsapp");
        expect(nextFirstOrderStop({ seen: ["statuses", "whatsapp"] }, confirmed, OFF)).toBe("courier");
        expect(nextFirstOrderStop({ seen: ["statuses", "whatsapp"], courier: "other" }, confirmed, OFF)).toBe("dispatch");
        expect(nextFirstOrderStop({ seen: ["statuses", "whatsapp"], courier: "other" }, printed, OFF)).toBeNull();
    });

    it("ticks the store order only for an order from the store, not a practice order", () => {
        expect(storeOrderPlaced(fresh)).toBe(false);
        expect(storeOrderPlaced(ordered)).toBe(true);
    });

    it("ticks WhatsApp and courier from the shop: auto-send on, Prime linked", () => {
        expect(nextFirstOrderStop({ seen: ["statuses"] }, printed, ON)).toBeNull();
        expect(nextFirstOrderStop({ seen: ["statuses"] }, printed, { autoSendOn: true, primeLinked: false })).toBe("courier");
        expect(nextFirstOrderStop({ seen: ["statuses"], courier: "prime" }, printed, { autoSendOn: false, primeLinked: false })).toBe("whatsapp");
    });

    it("never skips an earlier stop because a later one is done", () => {
        expect(nextFirstOrderStop({}, printed, ON)).toBe("statuses");
        expect(firstOrderDoneCount({}, printed, ON)).toBe(5);
        expect(firstOrderDoneCount({}, printed, OFF)).toBe(3);
    });
});

describe("firstOrderView", () => {
    it("offers only on the Orders page, and a Later waits a day", () => {
        expect(firstOrderView(undefined, null, null, true, NOW)).toEqual({ kind: "offer" });
        expect(firstOrderView(undefined, null, null, false, NOW)).toEqual({ kind: "none" });
        const later = new Date(NOW - 60_000).toISOString();
        expect(firstOrderView({ later_at: later }, null, null, true, NOW)).toEqual({ kind: "none" });
        expect(firstOrderView({ later_at: later }, null, null, true, NOW + FIRST_ORDER_LATER_MS)).toEqual({ kind: "offer" });
    });

    it("shows nothing while the orders or the shop's switches load, then the stop", () => {
        expect(firstOrderView({ started_at: "x" }, null, OFF, true, NOW)).toEqual({ kind: "none" });
        expect(firstOrderView({ started_at: "x" }, fresh, null, true, NOW)).toEqual({ kind: "none" });
        expect(firstOrderView({ started_at: "x" }, fresh, OFF, false, NOW)).toEqual({ kind: "stop", stop: "statuses" });
    });

    it("says when the practice orders ran out before the walk ended, even if the store order is still there", () => {
        expect(firstOrderView({ started_at: "x", seen: ["statuses"] }, [], OFF, true, NOW)).toEqual({ kind: "expired" });
        expect(firstOrderView({ started_at: "x", seen: ["statuses"] }, [fromStore], OFF, true, NOW)).toEqual({ kind: "expired" });
    });

    it("finishes once every stop ticks, and stays quiet after", () => {
        expect(firstOrderView({ started_at: "x", seen: ["statuses"] }, printed, ON, true, NOW)).toEqual({ kind: "finished" });
        expect(firstOrderView({ started_at: "x", done_at: "y" }, printed, ON, true, NOW)).toEqual({ kind: "none" });
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
