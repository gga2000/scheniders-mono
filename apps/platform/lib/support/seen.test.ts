import { describe, it, expect } from "vitest";
import { askWhy, seenMark } from "@/lib/support/seen";
import type { SupportMessage } from "@/lib/support/schema";

const CASE = "c1";
const msg = (id: string, sender_kind: SupportMessage["sender_kind"], created_at: string, case_id = CASE): SupportMessage => ({
    id,
    case_id,
    sender_kind,
    sender_name: null,
    body: id,
    created_at,
    screenshot_url: null,
    voice_url: null,
});
const latest = (staff_seen_at: string | null, staff_seen_name: string | null = "Noor") => ({
    id: CASE,
    staff_seen_at,
    staff_seen_name,
});

describe("seenMark", () => {
    it("shows who opened the conversation after the merchant's last message", () => {
        expect(seenMark(latest("2026-11-16T10:05:00Z"), [msg("m1", "merchant", "2026-11-16T10:00:00Z")])).toEqual({
            name: "Noor",
            at: "2026-11-16T10:05:00Z",
        });
    });

    it("hides it when the merchant wrote again after staff looked", () => {
        expect(
            seenMark(latest("2026-11-16T10:05:00Z"), [
                msg("m1", "merchant", "2026-11-16T10:00:00Z"),
                msg("m2", "merchant", "2026-11-16T10:06:00Z"),
            ]),
        ).toBeNull();
    });

    it("hides it once staff replied; the reply says it", () => {
        expect(
            seenMark(latest("2026-11-16T10:05:00Z"), [
                msg("m1", "merchant", "2026-11-16T10:00:00Z"),
                msg("m2", "staff", "2026-11-16T10:06:00Z"),
            ]),
        ).toBeNull();
    });

    it("ignores system lines and other conversations when finding the last word", () => {
        expect(
            seenMark(latest("2026-11-16T10:05:00Z"), [
                msg("old", "staff", "2026-11-16T09:00:00Z", "c0"),
                msg("m1", "merchant", "2026-11-16T10:00:00Z"),
                msg("s1", "system", "2026-11-16T10:01:00Z"),
            ]),
        ).toEqual({ name: "Noor", at: "2026-11-16T10:05:00Z" });
    });

    it("shows nothing before any staff member opened it", () => {
        expect(seenMark(latest(null, null), [msg("m1", "merchant", "2026-11-16T10:00:00Z")])).toBeNull();
    });

    it("compares times, not text, across offsets", () => {
        expect(
            seenMark(latest("2026-11-16T13:05:00+03:00"), [msg("m1", "merchant", "2026-11-16T10:00:00.123456+00:00")]),
        ).not.toBeNull();
    });
});

describe("askWhy", () => {
    it("asks after a No that has no reason yet", () => {
        expect(askWhy({ rating: "no", rated_at: "2026-11-16T10:00:00Z", no_reason_at: null })).toBe(true);
    });

    it("stops asking once the merchant answered this No", () => {
        expect(askWhy({ rating: "no", rated_at: "2026-11-16T10:00:00Z", no_reason_at: "2026-11-16T10:01:00Z" })).toBe(false);
    });

    it("asks again for a newer No", () => {
        expect(askWhy({ rating: "no", rated_at: "2026-11-16T12:00:00Z", no_reason_at: "2026-11-16T10:01:00Z" })).toBe(true);
    });

    it("never asks after a Yes or before any answer", () => {
        expect(askWhy({ rating: "yes", rated_at: "2026-11-16T10:00:00Z", no_reason_at: null })).toBe(false);
        expect(askWhy({ rating: null, rated_at: null, no_reason_at: null })).toBe(false);
    });
});
