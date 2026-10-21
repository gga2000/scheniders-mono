/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import { isValidSlug, normalizeSlug, slugRejection } from "./tenant-slug";

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
        for (const r of ["www", "api", "admin", "app", "store", "login"]) {
            expect(slugRejection(r)).toBe("reserved");
        }
    });

    it("normalizes pasted input", () => {
        expect(normalizeSlug("  Zahraa-Beauty ")).toBe("zahraa-beauty");
    });
});
