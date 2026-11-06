import { describe, expect, it } from "vitest";
import { stripLeadingGovernorate } from "@/lib/mcp/orders";

describe("stripLeadingGovernorate", () => {
    it("drops a repeated governorate and its separator", () => {
        expect(stripLeadingGovernorate("الديوانية / قضاء الشامية / يم مجمع الصدرين", "DWN")).toBe("قضاء الشامية / يم مجمع الصدرين");
        expect(stripLeadingGovernorate("ديالى - بعقوبة", "DYL")).toBe("بعقوبة");
        expect(stripLeadingGovernorate("البصرة / طويسة / شارع بنك التنمية", "BAS")).toBe("طويسة / شارع بنك التنمية");
        expect(stripLeadingGovernorate("محافظة كربلاء، فندق البارون", "KRB")).toBe("فندق البارون");
    });
    it("keeps addresses that do not start with the governorate", () => {
        expect(stripLeadingGovernorate("شارع الصناعة قرب البصرة", "BAS")).toBe("شارع الصناعة قرب البصرة");
        expect(stripLeadingGovernorate("البصرة", "BAS")).toBe("البصرة");
    });
});
