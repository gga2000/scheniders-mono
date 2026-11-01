import { describe, it, expect } from "vitest";
import { isAcceptedCnameTarget, normalizeCustomDomain } from "./custom-domain";

describe("normalizeCustomDomain", () => {
    it.each([
        ["Shop.Example.com", "shop.example.com"],
        ["https://shop.example.com/path?x=1", "shop.example.com"],
        ["  shop.example.com:8080 ", "shop.example.com"],
        ["shop.example.com.", "shop.example.com"],
    ])("cleans %s", (input, out) => expect(normalizeCustomDomain(input)).toBe(out));

    it.each(["", "localhost", "192.168.1.1", "bad domain.com", "a_b.example.com", "-x.example.com"])(
        "rejects %s",
        (input) => expect(normalizeCustomDomain(input)).toBeNull(),
    );
});

describe("isAcceptedCnameTarget", () => {
    it("accepts the Scheniders target and Vercel DNS, any case, trailing dot", () => {
        expect(isAcceptedCnameTarget("cname.scheniders.com")).toBe(true);
        expect(isAcceptedCnameTarget("CNAME.Scheniders.com.")).toBe(true);
        expect(isAcceptedCnameTarget("abc.vercel-dns.com")).toBe(true);
    });
    it("rejects lookalikes a substring check would pass", () => {
        expect(isAcceptedCnameTarget("cname.scheniders.com.attacker.net")).toBe(false);
        expect(isAcceptedCnameTarget("evil-scheniders.com")).toBe(false);
        expect(isAcceptedCnameTarget("notvercel.example.com")).toBe(false);
    });
});
