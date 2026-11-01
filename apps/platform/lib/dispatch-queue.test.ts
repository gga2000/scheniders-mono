import { describe, expect, it } from "vitest";
import { getQueueFlags, groupForPacking, hasBlockingFlag, packKey } from "./dispatch-queue";
import type { OrderItem } from "@/lib/supabase";

const NOW = new Date("2026-10-31T09:00:00Z").getTime();
const base = { print_count: 0, scheduled_date: null, phone: "07701234567", address_details: "Street 4", city: "Baghdad" };

describe("getQueueFlags", () => {
    it("flags nothing for a complete, unprinted, unscheduled order", () => {
        const flags = getQueueFlags(base, NOW);
        expect(flags).toEqual({ reprint: false, scheduledLater: false, missingPhone: false, missingAddress: false });
        expect(hasBlockingFlag(flags)).toBe(false);
    });

    it("flags reprints, later schedules and missing contact data", () => {
        const flags = getQueueFlags(
            { ...base, print_count: 2, scheduled_date: "2026-11-05", phone: " ", city: "" },
            NOW,
        );
        expect(flags.reprint).toBe(true);
        expect(flags.scheduledLater).toBe(true);
        expect(flags.missingPhone).toBe(true);
        expect(flags.missingAddress).toBe(true);
        expect(hasBlockingFlag(flags)).toBe(true);
    });

    it("does not treat an order scheduled for today as later", () => {
        expect(getQueueFlags({ ...base, scheduled_date: "2026-10-31" }, NOW).scheduledLater).toBe(false);
    });
});

const line = (name: string, quantity = 1) => ({ name, quantity, price: 1000 }) as OrderItem;
const pack = (id: string, items: OrderItem[], extra: { is_return?: boolean; is_replacement?: boolean } = {}) => ({
    id,
    items,
    is_return: extra.is_return ?? false,
    is_replacement: extra.is_replacement ?? false,
});

describe("packKey", () => {
    it("puts one product in any quantity in that product's group", () => {
        expect(packKey(pack("a", [line("فيوجن", 2)]))).toEqual({ kind: "item", item: "فيوجن" });
        expect(packKey(pack("b", [line("فيوجن"), line("فيوجن")]))).toEqual({ kind: "item", item: "فيوجن" });
    });
    it("separates several products, replacements and refunds", () => {
        expect(packKey(pack("a", [line("فيوجن"), line("انفوي")])).kind).toBe("multi");
        expect(packKey(pack("b", [line("فيوجن")], { is_replacement: true })).kind).toBe("replacement");
        expect(packKey(pack("c", [line("فيوجن")], { is_return: true })).kind).toBe("refund");
    });
});

describe("groupForPacking", () => {
    it("orders groups: shared products first, then lone products, multi, replacements, refunds", () => {
        const groups = groupForPacking([
            pack("r", [line("فيوجن")], { is_return: true }),
            pack("m", [line("فيوجن"), line("انفوي")]),
            pack("a1", [line("انفوي")]),
            pack("f1", [line("فيوجن")]),
            pack("p", [line("انفوي")], { is_replacement: true }),
            pack("f2", [line("فيوجن", 3)]),
        ]);
        expect(groups.map((g) => g.key)).toEqual(["item:فيوجن", "single", "multi", "replacement", "refund"]);
        expect(groups[0].orders.map((o) => o.id)).toEqual(["f1", "f2"]);
        expect(groups[1].orders.map((o) => o.id)).toEqual(["a1"]);
    });
});
