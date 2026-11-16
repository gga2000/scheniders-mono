import { describe, it, expect } from "vitest";
import {
  CaseActionSchema,
  fillSavedReply,
  formatDuration,
  formatWait,
  latestOrderNumber,
  percentOf,
  shotPaths,
  sortInbox,
  supportRefusal,
  type SupportCaseRow,
  type SupportMessageRow,
} from "./support";

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

describe("fillSavedReply", () => {
  it("fills the first name, the shop and the order", () => {
    expect(
      fillSavedReply("أهلاً {name} من {shop}، نراجع الطلب {order}", { name: " Ali Hassan ", shop: "Kawkab", order: "4261102017" }),
    ).toBe("أهلاً Ali من Kawkab، نراجع الطلب #4261102017");
  });

  it("does not double the # on an order that already has one", () => {
    expect(fillSavedReply("{order}", { order: "#77" })).toBe("#77");
  });

  it("leaves a token the conversation cannot fill, so staff see the gap", () => {
    expect(fillSavedReply("نراجع الطلب {order} يا {name}", { name: "", order: null })).toBe("نراجع الطلب {order} يا {name}");
  });

  it("leaves other braces alone", () => {
    expect(fillSavedReply("{phone} {name}", { name: "Noor" })).toBe("{phone} Noor");
  });
});

describe("latestOrderNumber", () => {
  const msg = (sender_kind: SupportMessageRow["sender_kind"], orderNumber?: string): SupportMessageRow => ({
    id: Math.random().toString(),
    case_id: "c",
    sender_kind,
    sender_name: null,
    body: "x",
    context: orderNumber ? { orderNumber } : {},
    created_at: "2026-11-16T10:00:00Z",
    screenshot_url: null,
  });

  it("takes the newest order a merchant had open", () => {
    expect(latestOrderNumber([msg("merchant", "1"), msg("merchant"), msg("merchant", "2"), msg("staff")])).toBe("2");
  });

  it("is null when no merchant message names an order", () => {
    expect(latestOrderNumber([msg("merchant"), msg("staff")])).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [null, "–"],
    [0, "0s"],
    [45.4, "45s"],
    [60, "1 min"],
    [12 * 60 + 20, "12 min"],
    [3600, "1 h"],
    [3 * 3600 + 5 * 60, "3 h 5 min"],
    [86400, "1 d"],
    [2 * 86400 + 4 * 3600, "2 d 4 h"],
  ])("shows %s seconds as %s", (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe("percentOf", () => {
  it("rounds to a whole percent and has no answer for nothing", () => {
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 5)).toBe(0);
    expect(percentOf(0, 0)).toBeNull();
  });
});

describe("shotPaths", () => {
  const T = "33333333-3333-4333-8333-333333333333";
  it("keeps only pictures inside this shop's own folder", () => {
    expect(
      shotPaths(
        [
          { context: { screenshot: `${T}/a.jpg` } },
          { context: {} },
          { context: { screenshot: "44444444-4444-4444-8444-444444444444/b.jpg" } },
        ],
        T,
      ),
    ).toEqual([`${T}/a.jpg`]);
  });
});
