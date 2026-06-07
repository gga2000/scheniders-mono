import { describe, it, expect } from "vitest";
import { dedupeReasonsByLabel } from "./order-reasons";

describe("dedupeReasonsByLabel", () => {
    it("collapses rows that share the same Arabic label, keeping the first", () => {
        // Mirrors the real tenant data: لم يرد / اعتراض على السعر / سبب آخر each appear twice.
        const input = [
            { id: "a", label_ar: "رفض العميل" },
            { id: "b", label_ar: "لم يرد" },
            { id: "c", label_ar: "اعتراض على السعر" },
            { id: "d", label_ar: "لم يرد" },             // dup
            { id: "e", label_ar: "سبب آخر" },
            { id: "f", label_ar: "اعتراض على السعر" },   // dup
            { id: "g", label_ar: "سبب آخر" },             // dup
        ];
        const out = dedupeReasonsByLabel(input);
        expect(out.map((r) => r.label_ar)).toEqual([
            "رفض العميل", "لم يرد", "اعتراض على السعر", "سبب آخر",
        ]);
        // keeps the first occurrence's row identity
        expect(out.find((r) => r.label_ar === "لم يرد")?.id).toBe("b");
    });

    it("treats whitespace-only differences as duplicates and skips blank labels", () => {
        const out = dedupeReasonsByLabel([
            { id: "1", label_ar: "سبب آخر" },
            { id: "2", label_ar: " سبب آخر " },
            { id: "3", label_ar: "   " },
        ]);
        expect(out.map((r) => r.id)).toEqual(["1"]);
    });

    it("returns an empty array unchanged", () => {
        expect(dedupeReasonsByLabel([])).toEqual([]);
    });
});
