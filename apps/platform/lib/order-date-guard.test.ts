import { describe, it, expect } from "vitest";
import {
    isFutureCreatedAtViolation,
    isFutureInstant,
    routeCreateOrderDate,
} from "./order-date-guard";

// 14:00 Baghdad on 7 Sep 2026.
const NOW = Date.parse("2026-09-07T11:00:00.000Z");

describe("isFutureCreatedAtViolation", () => {
    it("recognises the trigger's refusal", () => {
        expect(isFutureCreatedAtViolation({
            code: "23514",
            message: "orders.created_at cannot be in the future (2026-09-09 10:00:00+00). Use scheduled_date to postpone an order.",
        })).toBe(true);
    });

    it("does not mistake another check violation, or anything else, for it", () => {
        expect(isFutureCreatedAtViolation({ code: "23514", message: 'new row violates check constraint "price_positive"' })).toBe(false);
        expect(isFutureCreatedAtViolation({ code: "42501", message: "created_at cannot be in the future" })).toBe(false);
        expect(isFutureCreatedAtViolation(new Error("boom"))).toBe(false);
        expect(isFutureCreatedAtViolation(null)).toBe(false);
    });
});

describe("isFutureInstant", () => {
    it("allows the present and the past, with a minute of slack", () => {
        expect(isFutureInstant(new Date(NOW).toISOString(), NOW)).toBe(false);
        expect(isFutureInstant(new Date(NOW + 30_000).toISOString(), NOW)).toBe(false);
        expect(isFutureInstant("2026-09-01T10:00:00.000Z", NOW)).toBe(false);
    });

    it("flags a timestamp more than a minute ahead", () => {
        expect(isFutureInstant(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe(true);
    });

    it("ignores empty and unparseable input", () => {
        expect(isFutureInstant(null, NOW)).toBe(false);
        expect(isFutureInstant("not a date", NOW)).toBe(false);
    });
});

describe("routeCreateOrderDate", () => {
    it("sends a past date to created_at", () => {
        expect(routeCreateOrderDate("2026-09-05T08:00:00.000Z", NOW))
            .toEqual({ createdAt: "2026-09-05T08:00:00.000Z", scheduledDate: null });
    });

    it("sends a future date to scheduled_date as its Baghdad day, never to created_at", () => {
        expect(routeCreateOrderDate("2026-09-09T08:00:00.000Z", NOW))
            .toEqual({ createdAt: null, scheduledDate: "2026-09-09" });
    });

    it("files a future late-evening time under the Baghdad day it falls on", () => {
        // 22:30 UTC on the 9th is 01:30 on the 10th in Baghdad.
        expect(routeCreateOrderDate("2026-09-09T22:30:00.000Z", NOW).scheduledDate).toBe("2026-09-10");
    });

    it("does nothing without a usable date", () => {
        expect(routeCreateOrderDate(null, NOW)).toEqual({ createdAt: null, scheduledDate: null });
        expect(routeCreateOrderDate("nope", NOW)).toEqual({ createdAt: null, scheduledDate: null });
    });
});
