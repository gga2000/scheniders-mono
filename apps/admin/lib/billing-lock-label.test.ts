import { describe, expect, it } from "vitest";
import { lockSentence } from "./billing-lock-label";

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
