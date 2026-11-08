import { describe, it, expect } from "vitest";
import {
    dnsHostLabel,
    isAcceptedApexIp,
    isAcceptedCnameTarget,
    isApexDomain,
    normalizeCustomDomain,
    txtHostLabel,
    txtRecordsProve,
} from "./custom-domain";

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
    it("accepts the project-specific targets Vercel hands out now", () => {
        expect(isAcceptedCnameTarget("497c02790ff6f357.vercel-dns-017.com")).toBe(true);
        expect(isAcceptedCnameTarget("497C02790FF6F357.Vercel-DNS-017.com.")).toBe(true);
        expect(isAcceptedCnameTarget("abc.vercel-dns-3.com")).toBe(true);
    });
    it("rejects lookalikes of the project-specific form", () => {
        expect(isAcceptedCnameTarget("abc.vercel-dns-017.com.attacker.net")).toBe(false);
        expect(isAcceptedCnameTarget("abc.vercel-dns-x.com")).toBe(false);
        expect(isAcceptedCnameTarget("abc.myvercel-dns-017.com")).toBe(false);
        expect(isAcceptedCnameTarget("vercel-dns-017.com")).toBe(false);
        expect(isAcceptedCnameTarget("abc.vercel-dns.com.evil")).toBe(false);
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

describe("isAcceptedApexIp", () => {
    it("accepts Vercel's apex IPs only", () => {
        expect(isAcceptedApexIp("76.76.21.21")).toBe(true);
        expect(isAcceptedApexIp("216.150.1.1")).toBe(true);
        expect(isAcceptedApexIp("216.150.16.1")).toBe(true);
        expect(isAcceptedApexIp("192.64.119.16")).toBe(false);
        expect(isAcceptedApexIp("76.76.21.2")).toBe(false);
    });
});

describe("isApexDomain / dnsHostLabel / txtHostLabel", () => {
    it.each([
        ["example.com", true, "@", "_scheniders"],
        ["mystore.iq", true, "@", "_scheniders"],
        ["mystore.com.iq", true, "@", "_scheniders"],
        ["shop.example.com", false, "shop", "_scheniders.shop"],
        ["www.example.com", false, "www", "_scheniders.www"],
        ["shop.mystore.com.iq", false, "shop", "_scheniders.shop"],
        ["a.b.example.com", false, "a.b", "_scheniders.a.b"],
    ])("%s", (domain, apex, host, txt) => {
        expect(isApexDomain(domain)).toBe(apex);
        expect(dnsHostLabel(domain)).toBe(host);
        expect(txtHostLabel(domain)).toBe(txt);
    });
});
