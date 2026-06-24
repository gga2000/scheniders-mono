import { describe, it, expect } from "vitest";
import { isPrivateAddress } from "./ssrf";

describe("isPrivateAddress", () => {
    it("blocks IPv4 loopback / private / link-local ranges", () => {
        expect(isPrivateAddress("127.0.0.1")).toBe(true); // loopback
        expect(isPrivateAddress("127.255.255.255")).toBe(true);
        expect(isPrivateAddress("10.0.0.1")).toBe(true); // 10/8
        expect(isPrivateAddress("10.255.255.255")).toBe(true);
        expect(isPrivateAddress("172.16.0.1")).toBe(true); // 172.16/12
        expect(isPrivateAddress("172.31.255.255")).toBe(true);
        expect(isPrivateAddress("192.168.0.1")).toBe(true); // 192.168/16
        expect(isPrivateAddress("169.254.1.1")).toBe(true); // link-local
        expect(isPrivateAddress("0.0.0.0")).toBe(true); // unspecified / 0/8
        expect(isPrivateAddress("100.64.0.1")).toBe(true); // CGNAT
    });

    it("allows public IPv4 addresses", () => {
        expect(isPrivateAddress("8.8.8.8")).toBe(false);
        expect(isPrivateAddress("1.1.1.1")).toBe(false);
        expect(isPrivateAddress("172.32.0.1")).toBe(false); // just outside 172.16/12
        expect(isPrivateAddress("172.15.255.255")).toBe(false); // just below
        expect(isPrivateAddress("93.184.216.34")).toBe(false); // example.com
    });

    it("blocks IPv6 loopback / unique-local / link-local", () => {
        expect(isPrivateAddress("::1")).toBe(true); // loopback
        expect(isPrivateAddress("::")).toBe(true); // unspecified
        expect(isPrivateAddress("fc00::1")).toBe(true); // unique-local
        expect(isPrivateAddress("fd12:3456::1")).toBe(true); // unique-local
        expect(isPrivateAddress("fe80::1")).toBe(true); // link-local
    });

    it("blocks IPv4-mapped IPv6 forms of private addresses", () => {
        expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
        expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
        expect(isPrivateAddress("::ffff:192.168.1.1")).toBe(true);
        // Hex-encoded ::ffff:7f00:1 == 127.0.0.1
        expect(isPrivateAddress("::ffff:7f00:1")).toBe(true);
    });

    it("allows public IPv6 addresses", () => {
        expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false); // Google DNS
        expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
    });

    it("returns false for non-IP-literal input (named hosts resolved separately)", () => {
        expect(isPrivateAddress("example.com")).toBe(false);
        expect(isPrivateAddress("")).toBe(false);
        expect(isPrivateAddress("not-an-ip")).toBe(false);
    });
});
