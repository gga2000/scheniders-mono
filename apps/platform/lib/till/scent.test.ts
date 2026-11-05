import { describe, expect, it } from "vitest";
import type { TillProduct } from "./cart";
import { byNotes, notesInUse, similarTo } from "./scent";

const make = (id: string, notes: string[]): TillProduct => ({
    id,
    name: id,
    price: 1,
    image_url: null,
    tag_color: null,
    barcode: null,
    sku: null,
    available: 1,
    on_hand: 1,
    low_at: 0,
    notes,
    variants: [],
});
const oud = make("oud", ["oud", "woody", "smoky"]);
const wood = make("wood", ["woody", "amber"]);
const fresh = make("fresh", ["fresh", "citrus"]);
const blank = make("blank", []);
const shelf = [oud, wood, fresh, blank];

describe("scent helper", () => {
    it("finds bottles by note, most in common first", () => {
        expect(byNotes(shelf, ["woody", "smoky"]).map((p) => p.id)).toEqual(["oud", "wood"]);
        expect(byNotes(shelf, []).map((p) => p.id)).toEqual(["oud", "wood", "fresh"]);
    });

    it("offers bottles like the one liked, never itself", () => {
        expect(similarTo(shelf, oud).map((p) => p.id)).toEqual(["wood"]);
        expect(similarTo(shelf, blank)).toEqual([]);
    });

    it("lists the notes in use, most used first", () => {
        expect(notesInUse(shelf).slice(0, 2)).toEqual([
            { note: "woody", count: 2 },
            { note: "oud", count: 1 },
        ]);
    });
});
