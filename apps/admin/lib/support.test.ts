import { describe, it, expect } from "vitest";
import { CaseActionSchema, formatWait, sortInbox, supportRefusal, type SupportCaseRow } from "./support";

function row(over: Partial<SupportCaseRow>): SupportCaseRow {
  return {
    id: "c",
    tenant_id: "t",
    opened_by_name: "Ali",
    status: "waiting_us",
    owner_admin_id: null,
    owner_name: null,
    reason: null,
    first_reply_at: null,
    waiting_since: "2026-11-16T10:00:00Z",
    solved_at: null,
    rating: null,
    reopened_count: 0,
    last_message_at: "2026-11-16T10:00:00Z",
    last_message_preview: "",
    last_sender_kind: "merchant",
    created_at: "2026-11-16T10:00:00Z",
    tenants: null,
    ...over,
  };
}

describe("sortInbox", () => {
  it("puts the merchant who has waited longest first, then the ones we already answered", () => {
    const sorted = sortInbox([
      row({ id: "answered-old", status: "waiting_merchant", waiting_since: null, last_message_at: "2026-11-16T08:00:00Z" }),
      row({ id: "waiting-new", waiting_since: "2026-11-16T10:30:00Z" }),
      row({ id: "answered-new", status: "waiting_merchant", waiting_since: null, last_message_at: "2026-11-16T09:00:00Z" }),
      row({ id: "waiting-old", waiting_since: "2026-11-16T09:00:00Z" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["waiting-old", "waiting-new", "answered-new", "answered-old"]);
  });
});

describe("formatWait", () => {
  const since = "2026-11-16T10:00:00Z";
  const at = (minutes: number) => new Date(since).getTime() + minutes * 60_000;

  it.each([
    [0, "now"],
    [4, "4 min"],
    [60, "1 h"],
    [130, "2 h 10 min"],
    [60 * 24 * 3 + 5, "3 d"],
  ])("%i minutes reads %s", (minutes, label) => {
    expect(formatWait(since, at(minutes))).toBe(label);
  });

  it("never shows a negative wait when clocks disagree", () => {
    expect(formatWait(since, at(-3))).toBe("now");
  });
});

describe("supportRefusal", () => {
  it("recognises only the refusals the support functions raise", () => {
    expect(supportRefusal({ code: "P0001", message: "support_case_solved" })?.status).toBe(409);
    expect(supportRefusal({ code: "P0001", message: "something else" })).toBeNull();
    expect(supportRefusal({ code: "23505", message: "support_case_solved" })).toBeNull();
    expect(supportRefusal(null)).toBeNull();
  });
});

describe("CaseActionSchema", () => {
  it("trims a reply and drops fields it does not know", () => {
    expect(CaseActionSchema.parse({ action: "reply", body: "  hi  ", p_admin_id: "x" })).toEqual({
      action: "reply",
      body: "hi",
    });
  });
});
