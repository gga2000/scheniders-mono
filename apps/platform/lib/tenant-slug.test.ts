/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import { isValidSlug, normalizeSlug, slugRejection, suggestSlug } from "./tenant-slug";

describe("isValidSlug (handle claim, UX2-13)", () => {
    it("accepts readable handles", () => {
        expect(isValidSlug("noor-beauty")).toBe(true);
        expect(isValidSlug("zahraa2")).toBe(true);
        expect(isValidSlug("abc")).toBe(true);
        expect(isValidSlug("a".repeat(30))).toBe(true);
    });

    it("rejects bad formats", () => {
        expect(slugRejection("ab")).toBe("format"); // too short
        expect(slugRejection("a".repeat(31))).toBe("format"); // too long
        expect(slugRejection("-noor")).toBe("format"); // leading hyphen
        expect(slugRejection("noor-")).toBe("format"); // trailing hyphen
        expect(slugRejection("noor--beauty")).toBe("format"); // double hyphen
        expect(slugRejection("Noor")).toBe("format"); // uppercase
        expect(slugRejection("متجر")).toBe("format"); // non-latin
        expect(slugRejection("noor beauty")).toBe("format"); // space
        expect(slugRejection("__domain__x")).toBe("format"); // the proxy's custom-domain key
    });

    it("rejects reserved platform subdomains", () => {
        for (const r of ["www", "api", "admin", "app", "store", "login", "partners", "fermi", "usefermi"]) {
            expect(slugRejection(r)).toBe("reserved");
        }
    });

    it("normalizes pasted input", () => {
        expect(normalizeSlug("  Zahraa-Beauty ")).toBe("zahraa-beauty");
    });
});

describe("platform-looking addresses (B11)", () => {
    it("refuses an address that poses as the platform's name", () => {
        expect(slugRejection("scheniders-shop")).toBe("reserved");
        expect(slugRejection("usefermi-store")).toBe("reserved");
        expect(slugRejection("fermi-perfume")).toBeNull();
    });
});

describe("suggestSlug: the address offered at signup (B11)", () => {
    it("spells an Arabic store name in Latin letters", () => {
        expect(suggestSlug("متجر زهراء")).toBe("mtjr-zhra");
        expect(suggestSlug("Noor Beauty")).toBe("noor-beauty");
    });

    it("always offers an address the form accepts", () => {
        for (const name of ["نو", "متجر عطور العراق الأول للعطور الفرنسية الأصلية", "Store", "Scheniders", "a", "  --Noor--  "]) {
            const slug = suggestSlug(name);
            expect(slugRejection(slug), `${name} → ${slug}`).toBeNull();
        }
    });

    it("offers nothing for a name with nothing to spell it with, so the merchant types one", () => {
        expect(suggestSlug("")).toBe("");
        expect(suggestSlug("🌸")).toBe("");
    });
});
