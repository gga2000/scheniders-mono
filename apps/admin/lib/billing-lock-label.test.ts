import { describe, expect, it } from "vitest";
import {
  lockedBecause,
  lockOpensWords,
  lockReasonWords,
  lockSentence,
  RENEWAL_OFF_FREE_TIME,
  renewalOffOpens,
  RENEWAL_STOP_WORDS,
} from "./billing-lock-label";
import { reactivateWords } from "./shop-actions";

describe("lockSentence", () => {
  const now = new Date("2026-11-19T10:00:00Z");

  it("says why and since which Baghdad day", () => {
    expect(lockSentence({ reason: "trial_ended", since: "2026-11-15T18:36:00Z" }, now)).toBe(
      "Trial ended, not paid. Locked since Sun 15 Nov.",
    );
    expect(lockSentence({ reason: "unpaid", since: "2026-11-10T03:00:00Z" }, now)).toBe(
      "Month not paid. Locked since Tue 10 Nov.",
    );
  });

  it("dates a lock at 00:30 Baghdad by the new day, not the UTC day before", () => {
    expect(lockSentence({ reason: "unpaid", since: "2026-11-15T21:30:00Z" }, now)).toBe(
      "Month not paid. Locked since Mon 16 Nov.",
    );
  });

  it("writes September in three letters, and the year of a lock from another year", () => {
    expect(lockSentence({ reason: "unpaid", since: "2026-09-01T09:00:00Z" }, now)).toBe("Month not paid. Locked since Tue 1 Sep.");
    expect(lockSentence({ reason: "unpaid", since: "2025-11-15T09:00:00Z" }, now)).toBe("Month not paid. Locked since Sat 15 Nov 2025.");
  });

  it("leaves the date out when there is none", () => {
    expect(lockSentence({ reason: "unpaid", since: null }, now)).toBe("Month not paid.");
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

/*
 * Round 21 (structure new 6, data new 1): what opens a lock that renewal off
 * made was typed by hand in six places. Some said staff turning renewal on
 * opens it with no word of the wallet, and none named the free unlock or free
 * days, which open it too. Every surface now says it through one clause.
 */
describe("what opens a lock that renewal off made", () => {
  const now = new Date("2026-11-22T12:00:00Z");

  it("names both ways, the shop paying on its lock screen and staff turning renewal on with the month in the wallet", () => {
    expect(renewalOffOpens(9000)).toBe("the shop pays 9,000 IQD on its lock screen, or staff turn renewal on and the wallet pays it");
    expect(renewalOffOpens()).toBe("the shop pays the month on its lock screen, or staff turn renewal on and the wallet pays it");
  });

  it("is said through that one clause by the lock card, the status line's lock, Reactivate and Stop renewing", () => {
    expect(lockOpensWords(9000, false, true)).toContain(renewalOffOpens(9000));
    expect(lockOpensWords(9000, true, true)).toContain(renewalOffOpens(9000));
    expect(reactivateWords("active_unpaid_renewal_off", null, now)).toContain(renewalOffOpens());
    expect(RENEWAL_STOP_WORDS).toContain(renewalOffOpens());
  });

  it("names the free unlock and free days to staff who may give them, and not while the shop is paused", () => {
    expect(lockOpensWords(9000, false, true, true)).toContain(RENEWAL_OFF_FREE_TIME);
    expect(lockOpensWords(9000, false, true)).not.toContain(RENEWAL_OFF_FREE_TIME);
    // Both are refused while the shop is paused.
    expect(lockOpensWords(9000, true, true, true)).not.toContain(RENEWAL_OFF_FREE_TIME);
    // With renewal on, money opens it: nothing to add.
    expect(lockOpensWords(9000, false, false, true)).toBe("Paying 9,000 IQD from the wallet opens it again.");
  });
});
