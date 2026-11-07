import { describe, it, expect } from "vitest";
import { isAcceptedCnameTarget, normalizeCustomDomain, txtRecordsProve } from "./custom-domain";

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
        expect(isAcceptedCnameTarget("cname.vercel-dns.com")).toBe(true);
        expect(isAcceptedCnameTarget("CNAME.Vercel-DNS.com.")).toBe(true);
        expect(isAcceptedCnameTarget("abc.vercel-dns.com")).toBe(true);
    });
    it("rejects lookalikes a substring check would pass", () => {
        expect(isAcceptedCnameTarget("cname.vercel-dns.com.attacker.net")).toBe(false);
        expect(isAcceptedCnameTarget("evil-scheniders.com")).toBe(false);
        expect(isAcceptedCnameTarget("notvercel.example.com")).toBe(false);
    });
});

describe("txtRecordsProve", () => {
    it("accepts the store's own token, joined across DNS chunks", () => {
        expect(txtRecordsProve([["v=spf1 -all"], ["scheniders-verify=", "abc123"]], "abc123")).toBe(true);
    });

    it("refuses another token, a partial match and no records", () => {
        expect(txtRecordsProve([["scheniders-verify=zzz"]], "abc123")).toBe(false);
        expect(txtRecordsProve([["scheniders-verify=abc1234"]], "abc123")).toBe(false);
        expect(txtRecordsProve([], "abc123")).toBe(false);
    });
});
