import { describe, expect, it } from "vitest";
import { runFileNames } from "@/lib/shipping-labels";

describe("runFileNames", () => {
    it("names both files of a run in Arabic, dated by the Baghdad day", () => {
        // 22:30 UTC on 31 Oct is already 1 Nov in Baghdad.
        const names = runFileNames(44, new Date("2026-10-31T22:30:00Z"));
        expect(names.labels).toBe("ملصقات الشحن - 44 طلب - 2026-11-01.pdf");
        expect(names.prime).toBe("ملف برايم - 44 طلب - 2026-11-01.xlsx");
    });
});
