/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import { generateSlug } from "./tenant";

describe("generateSlug", () => {
    it("slugifies latin names", () => {
        expect(generateSlug("Acme Perfumes")).toBe("acme-perfumes");
        expect(generateSlug("  Noor  Beauty  ")).toBe("noor-beauty");
    });

    it("UX2-13: transliterates Arabic instead of falling back to a machine id", () => {
        // Before the fix these all stripped to "" → `tenant-<timestamp>`,
        // which is what the merchant then shared on WhatsApp.
        const zahraa = generateSlug("متجر زهراء");
        expect(zahraa).not.toMatch(/^tenant-\d+$/);
        expect(zahraa).toMatch(/^[a-z0-9-]+$/);
        expect(zahraa).toContain("-");

        expect(generateSlug("نور")).toBe("nwr");
        expect(generateSlug("بغداد ستور")).toBe("bghdad-stwr");
    });

    it("handles mixed Arabic + latin", () => {
        expect(generateSlug("متجر Zahraa")).toBe("mtjr-zahraa");
    });

    it("drops diacritics rather than turning them into separators", () => {
        expect(generateSlug("مَتْجَر")).toBe("mtjr");
    });

    it("still falls back for names with no slugifiable characters", () => {
        expect(generateSlug("!!!")).toMatch(/^tenant-\d+$/);
        expect(generateSlug("")).toMatch(/^tenant-\d+$/);
    });
});
