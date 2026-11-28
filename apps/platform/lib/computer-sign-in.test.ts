import { describe, expect, it } from "vitest";
import {
    SIGN_IN_COLLECT_MS,
    computerSignInIdFromScan,
    computerSignInPath,
    computerSignInState,
    describeDevice,
    isPhoneScreen,
} from "./computer-sign-in";

const NOW = Date.parse("2026-11-28T15:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const row = (fields: Partial<Parameters<typeof computerSignInState>[0]> = {}) => ({
    expires_at: iso(NOW + 60_000),
    approved_at: null,
    declined_at: null,
    used_at: null,
    ...fields,
});

describe("computerSignInState", () => {
    it("waits until the code runs out", () => {
        expect(computerSignInState(row(), NOW)).toBe("waiting");
        expect(computerSignInState(row({ expires_at: iso(NOW) }), NOW)).toBe("expired");
    });

    it("is approved for a short while after the phone's yes, then expired", () => {
        const approved = row({ approved_at: iso(NOW - 1000) });
        expect(computerSignInState(approved, NOW)).toBe("approved");
        expect(computerSignInState(approved, NOW + SIGN_IN_COLLECT_MS)).toBe("expired");
    });

    it("an approved code past its scan time can still be collected", () => {
        expect(computerSignInState(row({ expires_at: iso(NOW - 1000), approved_at: iso(NOW - 2000) }), NOW)).toBe("approved");
    });

    it("used and declined win over everything", () => {
        expect(computerSignInState(row({ approved_at: iso(NOW), used_at: iso(NOW) }), NOW)).toBe("used");
        expect(computerSignInState(row({ declined_at: iso(NOW) }), NOW)).toBe("declined");
    });
});

describe("computerSignInIdFromScan", () => {
    const id = "7f3c9a2e-4b1d-4e8a-9c55-2d6b1a0e8f41";

    it("takes the id from our code, on any of our addresses", () => {
        expect(computerSignInIdFromScan(`https://app.usefermi.com${computerSignInPath(id)}`)).toBe(id);
        expect(computerSignInIdFromScan(`https://schenidersapp.xyz/pair/${id.toUpperCase()}/`)).toBe(id);
        expect(computerSignInIdFromScan(`  http://localhost:3000/pair/${id}\n`)).toBe(id);
    });

    it("refuses anything else", () => {
        expect(computerSignInIdFromScan("6281234567890")).toBeNull();
        expect(computerSignInIdFromScan(`https://app.usefermi.com/pair/${id}/extra`)).toBeNull();
        expect(computerSignInIdFromScan("https://app.usefermi.com/pair/not-a-uuid")).toBeNull();
        expect(computerSignInIdFromScan(`javascript:alert(1)//pair/${id}`)).toBeNull();
        expect(computerSignInIdFromScan(`WIFI:S:shop;T:WPA;P:${id};;`)).toBeNull();
    });
});

describe("describeDevice", () => {
    it("names common computers", () => {
        expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")).toEqual({ browser: "Chrome", os: "Windows" });
        expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0")).toEqual({ browser: "Edge", os: "Windows" });
        expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15")).toEqual({ browser: "Safari", os: "Mac" });
        expect(describeDevice("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")).toEqual({ browser: "Chrome", os: "ChromeOS" });
        expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; rv:133.0) Gecko/20100101 Firefox/133.0")).toEqual({ browser: "Firefox", os: "Windows" });
    });

    it("tells an iPad in desktop mode from a Mac by touch", () => {
        const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
        expect(describeDevice(ua, true)).toEqual({ browser: "Safari", os: "iPad" });
    });

    it("leaves unknown parts empty", () => {
        expect(describeDevice("curl/8.5.0")).toEqual({ browser: "", os: "" });
    });
});

describe("isPhoneScreen", () => {
    it("goes by the shorter side, so turning the phone keeps it a phone", () => {
        expect(isPhoneScreen(390, 844)).toBe(true);
        expect(isPhoneScreen(932, 430)).toBe(true);
        expect(isPhoneScreen(744, 1133)).toBe(false); // iPad mini
        expect(isPhoneScreen(1180, 820)).toBe(false); // iPad Air landscape
        expect(isPhoneScreen(1440, 900)).toBe(false);
    });
});
