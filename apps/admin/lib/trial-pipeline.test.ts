import { describe, expect, it } from "vitest";
import {
  inTrialFilter,
  trialFacts,
  trialFilterCounts,
  trialFollowUpResponseSchema,
  type TrialFollowUp,
  type TrialFollowUpRow,
} from "./trial-pipeline";

/*
 * The follow-up line and chips on Trials (Fermi B12 item 1, concept A, Ali's
 * pick 22 Nov): one line of facts under each shop, and chips that show a
 * follow-up group or the shops nobody has called.
 */

const followUp = (extra: Partial<TrialFollowUp> = {}): TrialFollowUp => ({
  tenant_id: "shop-1",
  owner_phone: "07701234567",
  orders: 0,
  delivered: 0,
  shipped: false,
  whatsapp_sent: 0,
  whatsapp_cap: 200,
  prime_linked: false,
  trial_check: null,
  trial_check_decision: null,
  lock_reason: null,
  last_call: null,
  ...extra,
});

const row = (extra: Partial<TrialFollowUpRow> = {}): TrialFollowUpRow => ({
  id: "shop-1",
  trial_day: 3,
  days_remaining: 5,
  is_expired: false,
  groups: ["day_3"],
  follow_up: followUp(),
  ...extra,
});

const ago = () => "2 hours ago";
const words = (r: TrialFollowUpRow) => trialFacts(r, ago).map((f) => `${f.label} ${f.value}`);

describe("trialFacts", () => {
  it("reads a shop's trial day, orders, shipping, WhatsApp, Prime, one-trial check and last call", () => {
    const shop = row({
      follow_up: followUp({
        orders: 4,
        delivered: 1,
        shipped: true,
        whatsapp_sent: 12,
        prime_linked: true,
        last_call: { at: "2026-11-22T14:00:00Z", by: "Noor", outcome: "done" },
      }),
    });
    expect(words(shop)).toEqual([
      "Day 3",
      "Orders 4, 1 delivered",
      "Shipped yes",
      "WhatsApp 12/200",
      "Prime linked",
      "One-trial check clear",
      "Last call Noor, 2 hours ago",
    ]);
  });

  it("says a shop's last day, a trial that is over, and a shop with nothing yet", () => {
    const last = row({ trial_day: 7, days_remaining: 0, groups: ["last_day"], follow_up: followUp({ trial_check: "no_trial" }) });
    expect(words(last)).toEqual([
      "Day 7, last day",
      "Orders none yet",
      "Shipped no",
      "WhatsApp 0/200",
      "Prime no",
      "One-trial check matches a shop",
      "Last call none",
    ]);
    // Audit round 22: the day before the end is no "last day", and no day
    // carries a total that moves ("of 7", then "of 8").
    expect(words(row({ trial_day: 6, days_remaining: 1, groups: ["last_day"] }))[0]).toBe("Day 6");
    expect(words(row({ trial_day: 8, days_remaining: -1, is_expired: true, groups: ["locked"] }))[0]).toBe("Day 8, trial over");
    // The end day after the hour: over, not its last day.
    expect(words(row({ trial_day: 7, days_remaining: 0, is_expired: true, groups: ["locked"] }))[0]).toBe("Day 7, trial over");
  });

  it("names the one-trial decision and how the last call went", () => {
    const decided = row({
      follow_up: followUp({
        trial_check: "review",
        trial_check_decision: "allow_trial",
        last_call: { at: "2026-11-22T14:00:00Z", by: "Karrar", outcome: "no_answer" },
      }),
    });
    expect(words(decided).slice(-2)).toEqual(["One-trial check trial given back", "Last call Karrar, 2 hours ago, no answer"]);
    expect(words(row({ follow_up: followUp({ trial_check: "review" }) }))).toContain("One-trial check to review");
  });

  it("gives only the day for a shop whose facts are not read yet", () => {
    expect(words(row({ follow_up: null }))).toEqual(["Day 3"]);
  });
});

describe("the chips", () => {
  const called = row({ id: "a", groups: ["day_1"], follow_up: followUp({ last_call: { at: "2026-11-22T14:00:00Z", by: "Noor", outcome: "later" } }) });
  const quiet = row({ id: "b", groups: ["last_day", "paused"] });
  const unread = row({ id: "c", groups: [], follow_up: null });
  const rows = new Map([called, quiet, unread].map((r) => [r.id, r]));

  it("shows a shop under each of its groups, and under Not called while nobody has called it", () => {
    expect(inTrialFilter(called, "day_1")).toBe(true);
    expect(inTrialFilter(called, "not_called")).toBe(false);
    expect(inTrialFilter(quiet, "last_day") && inTrialFilter(quiet, "paused") && inTrialFilter(quiet, "not_called")).toBe(true);
    expect(inTrialFilter(quiet, "locked")).toBe(false);
  });

  it("shows a shop whose facts are not read yet only under All", () => {
    expect(inTrialFilter(unread, "all")).toBe(true);
    expect(inTrialFilter(unread, "not_called")).toBe(false);
    expect(inTrialFilter(undefined, "all")).toBe(true);
    expect(inTrialFilter(undefined, "day_1")).toBe(false);
  });

  it("counts the listed shops under each chip", () => {
    expect(trialFilterCounts(["a", "b", "c", "d"], rows)).toEqual({
      all: 4,
      day_1: 1,
      day_3: 0,
      last_day: 1,
      locked: 0,
      paused: 1,
      not_called: 1,
    });
  });
});

describe("trialFollowUpResponseSchema", () => {
  it("keeps what the line needs from the follow-up read and refuses a misshapen answer", () => {
    const parsed = trialFollowUpResponseSchema.parse({
      trials: [{ ...row(), business_name: "Kut Perfumes", balance_iqd: 0 }],
    });
    expect(parsed.trials[0]).toEqual(row());
    expect(() => trialFollowUpResponseSchema.parse({ trials: [{ ...row(), groups: ["day_2"] }] })).toThrow();
  });
});
