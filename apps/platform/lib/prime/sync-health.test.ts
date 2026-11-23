import { describe, expect, it } from "vitest";
import { PRIME_SYNC_LATE_MS, primeSyncLateMinutes, primeWaitUnit } from "./sync-health";

const NOW = Date.parse("2026-11-23T08:11:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe("primeSyncLateMinutes", () => {
    it("stays quiet between reads, even when one read slipped to 20 minutes", () => {
        expect(primeSyncLateMinutes(ago(14), NOW)).toBeNull();
        expect(primeSyncLateMinutes(ago(20), NOW)).toBeNull();
        expect(primeSyncLateMinutes(ago(PRIME_SYNC_LATE_MS / 60_000), NOW)).toBeNull();
    });

    it("calls the link late once two reads in a row have failed", () => {
        expect(primeSyncLateMinutes(ago(46), NOW)).toBe(46);
        // 23 Nov: the last good read was at 23:45:27Z, Prime refused every one after.
        expect(primeSyncLateMinutes("2026-11-22T23:45:27Z", NOW)).toBe(506);
    });

    it("has nothing to call late before the first read, or for a time it cannot read", () => {
        expect(primeSyncLateMinutes(null, NOW)).toBeNull();
        expect(primeSyncLateMinutes("not a time", NOW)).toBeNull();
    });
});

describe("primeWaitUnit", () => {
    it("reads minutes under an hour, hours under two days, then days", () => {
        expect(primeWaitUnit(46)).toEqual({ key: "prime.wait.minutes", count: 46 });
        expect(primeWaitUnit(60)).toEqual({ key: "prime.wait.hours", count: 1 });
        expect(primeWaitUnit(506)).toEqual({ key: "prime.wait.hours", count: 8 });
        expect(primeWaitUnit(48 * 60 - 1)).toEqual({ key: "prime.wait.hours", count: 47 });
        expect(primeWaitUnit(3 * 24 * 60 + 5)).toEqual({ key: "prime.wait.days", count: 3 });
    });
});
