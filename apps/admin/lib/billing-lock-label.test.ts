import { describe, expect, it } from "vitest";
import { lockedBecause, lockReasonWords, lockSentence } from "./billing-lock-label";

describe("lockSentence", () => {
  it("says why and since which Baghdad day", () => {
    expect(lockSentence({ reason: "trial_ended", since: "2026-11-15T18:36:00Z" })).toBe(
      "Trial ended, not paid. Locked since Sun 15 Nov.",
    );
    expect(lockSentence({ reason: "unpaid", since: "2026-11-10T03:00:00Z" })).toBe(
      "Month not paid. Locked since Tue 10 Nov.",
    );
  });

  it("dates a lock at 00:30 Baghdad by the new day, not the UTC day before", () => {
    expect(lockSentence({ reason: "unpaid", since: "2026-11-15T21:30:00Z" })).toBe(
      "Month not paid. Locked since Mon 16 Nov.",
    );
  });

  it("leaves the date out when there is none", () => {
    expect(lockSentence({ reason: "unpaid", since: null })).toBe("Month not paid.");
  });
});

/*
 * Round 14 (data new 2, structure new 3): Health said "Locked: trial ended",
 * Payments "Locked, month unpaid" and the support card "(trial ended)", while
 * the list, the shop page and Needs us said "Trial ended, not paid". Every
 * screen now takes the words from LOCK_REASON_WORDS.
 */
describe("the lock in a line among other things", () => {
  it("uses the same words as the list, the shop page and Needs us", () => {
    expect(lockReasonWords("trial_ended")).toBe("Trial ended, not paid");
    expect(lockReasonWords("unpaid")).toBe("Month not paid");
    expect(lockedBecause("trial_ended")).toBe("Locked: trial ended, not paid");
    expect(lockedBecause("unpaid", " since yesterday")).toBe("Locked since yesterday: month not paid");
  });

  it("says Locked alone with no reason, and a reason the console does not know as written", () => {
    expect(lockedBecause(null)).toBe("Locked");
    expect(lockReasonWords("bank_hold")).toBe("bank hold");
  });
});
