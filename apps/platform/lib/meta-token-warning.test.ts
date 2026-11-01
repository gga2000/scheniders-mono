import { describe, expect, it } from "vitest";
import { tokenWarning } from "./meta-token-warning";

const now = new Date("2026-11-01T12:00:00Z");
const ok = { isValid: true, expiresAt: null, hasAdsRead: true };

describe("tokenWarning", () => {
    it("is silent when Meta could not be asked or the token never expires", () => {
        expect(tokenWarning(null, now)).toBeNull();
        expect(tokenWarning(ok, now)).toBeNull();
    });
    it("flags invalid before anything else", () => {
        expect(tokenWarning({ ...ok, isValid: false, hasAdsRead: false }, now)).toBe("invalid");
    });
    it("flags a missing ads_read scope", () => {
        expect(tokenWarning({ ...ok, hasAdsRead: false }, now)).toBe("missingAdsRead");
    });
    it("flags expiry within 7 days only", () => {
        expect(tokenWarning({ ...ok, expiresAt: "2026-11-05T00:00:00Z" }, now)).toBe("expiring");
        expect(tokenWarning({ ...ok, expiresAt: "2026-12-01T00:00:00Z" }, now)).toBeNull();
    });
});
