import { describe, expect, it } from "vitest";
import { newSignupWaitTicket, signupWaitOpen, signupWaitTicketMatches } from "./signup-wait";

describe("signup wait ticket", () => {
    it("matches only its own ticket, and keeps nothing that reveals it", () => {
        const a = newSignupWaitTicket();
        const b = newSignupWaitTicket();
        expect(a.ticket).not.toBe(b.ticket);
        expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(a.hash).not.toContain(a.ticket);
        expect(signupWaitTicketMatches(a.ticket, a.hash)).toBe(true);
        expect(signupWaitTicketMatches(b.ticket, a.hash)).toBe(false);
        expect(signupWaitTicketMatches(a.hash, a.hash)).toBe(false);
    });

    it("matches nothing when the account keeps no hash, or a malformed one", () => {
        const { ticket } = newSignupWaitTicket();
        for (const stored of [undefined, null, "", "abc", 42, "z".repeat(64)]) {
            expect(signupWaitTicketMatches(ticket, stored)).toBe(false);
        }
    });

    it("stays open for a day after sign-up", () => {
        const now = Date.parse("2026-11-28T12:00:00Z");
        expect(signupWaitOpen("2026-11-28T11:00:00Z", now)).toBe(true);
        expect(signupWaitOpen("2026-11-27T12:30:00Z", now)).toBe(true);
        expect(signupWaitOpen("2026-11-27T11:00:00Z", now)).toBe(false);
        expect(signupWaitOpen("not a date", now)).toBe(false);
    });
});
