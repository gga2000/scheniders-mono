import { describe, expect, it } from "vitest";
import { cleanTagName, nextTagColor, tagsOf, toggleTagId, type OrderTag } from "./order-tags";

const TAGS: OrderTag[] = [
    { id: "00000000-0000-4000-8000-000000000001", name: "Call back", color: "orange" },
    { id: "00000000-0000-4000-8000-000000000002", name: "VIP", color: "purple" },
];

describe("order tags", () => {
    it("lists an order's tags in the store's order and skips deleted ones", () => {
        expect(tagsOf([TAGS[1].id, "gone", TAGS[0].id], TAGS).map((t) => t.name)).toEqual(["Call back", "VIP"]);
        expect(tagsOf(undefined, TAGS)).toEqual([]);
    });

    it("toggles a tag on and off", () => {
        expect(toggleTagId([], "a")).toEqual(["a"]);
        expect(toggleTagId(["a", "b"], "a")).toEqual(["b"]);
    });

    it("cleans names and refuses empty or duplicate ones", () => {
        expect(cleanTagName("  Fragile   box ", TAGS)).toBe("Fragile box");
        expect(cleanTagName("   ", TAGS)).toBeNull();
        expect(cleanTagName("vip", TAGS)).toBeNull();
        expect(cleanTagName("vip", TAGS, TAGS[1].id)).toBe("vip");
        expect(cleanTagName("x".repeat(40), TAGS)).toHaveLength(24);
    });

    it("picks an unused colour for a new tag", () => {
        expect(nextTagColor([])).toBe("blue");
        expect(nextTagColor([{ ...TAGS[0], color: "blue" }])).toBe("green");
    });
});
