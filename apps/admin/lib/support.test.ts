import { describe, it, expect } from "vitest";
import {
  CaseActionSchema,
  fillSavedReply,
  formatAgo,
  formatDue,
  callBackNumber,
  sortTasks,
  taskLabel,
  TaskLogSchema,
  type SupportTask,
  formatDuration,
  leadProblem,
  problemDetail,
  formatWait,
  latestOrderNumber,
  percentOf,
  filePaths,
  sortInbox,
  supportRefusal,
  supportTimeline,
  type SupportCaseNote,
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
    no_reason: null,
    reopened_count: 0,
    last_message_at: "2026-11-16T10:00:00Z",
    last_message_preview: "",
    last_sender_kind: "merchant",
    started_by: "merchant",
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
    voice_url: null,
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

describe("filePaths", () => {
  const T = "33333333-3333-4333-8333-333333333333";
  const O = "44444444-4444-4444-8444-444444444444";
  const rows = [
    { context: { screenshot: `${T}/a.jpg`, voice: `${T}/v.webm` } },
    { context: {} },
    { context: { screenshot: `${O}/b.jpg`, voice: `${O}/w.m4a` } },
  ];

  it("keeps only pictures inside this shop's own folder", () => {
    expect(filePaths(rows, T, "screenshot")).toEqual([`${T}/a.jpg`]);
  });

  it("keeps only voice notes inside this shop's own folder", () => {
    expect(filePaths(rows, T, "voice")).toEqual([`${T}/v.webm`]);
  });
});

describe("leadProblem", () => {
  const p = (code: Parameters<typeof problemDetail>[0]) => ({ code, since: null, detail: null });

  it("opens with the store being down before anything smaller", () => {
    expect(leadProblem([p("trial_ending"), p("wallet_empty"), p("store_paused")])).toBe("store_paused");
    expect(leadProblem([p("trial_ending"), p("orders_stopped")])).toBe("orders_stopped");
  });
});

describe("problemDetail", () => {
  it("puts counts into words and leaves free text alone", () => {
    expect(problemDetail("waseet_failing", "4")).toBe("4 failed in 24 h");
    expect(problemDetail("orders_stopped", "262")).toBe("none in 48 h, 262 in the 2 weeks before");
    expect(problemDetail("wallet_empty", "-1500")).toBe("-1,500 IQD");
    expect(problemDetail("prime_error", "token expired")).toBe("token expired");
    expect(problemDetail("trial_ending", null)).toBeNull();
    expect(problemDetail("store_paused", " ")).toBeNull();
  });
});

describe("formatAgo", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  it("says how long ago, in the console's words", () => {
    expect(formatAgo("2026-11-16T11:59:30Z", now)).toBe("just now");
    expect(formatAgo("2026-11-16T09:00:00Z", now)).toBe("3 h ago");
    expect(formatAgo("2026-11-14T08:00:00Z", now)).toBe("2 d 4 h ago");
  });
});

describe("sortTasks", () => {
  const task = (id: string, owner: string | null, due: string, kind: SupportTask["kind"] = "welcome_call"): SupportTask => ({
    id,
    kind,
    topic: null,
    due_at: due,
    attempts: 0,
    phone: kind === "call_back" ? "07701234567" : null,
    requested_by: null,
    tenant_id: "t",
    business_name: "Shop",
    display_id: null,
    trial_ends_at: null,
    shop_status: "trial",
    orders: 0,
    owner_id: owner,
    owner_name: null,
    calls: [],
  });

  it("puts my tasks first, then each group by due time", () => {
    const tasks = [
      task("a", "other", "2026-11-16T08:00:00Z"),
      task("b", "me", "2026-11-16T12:00:00Z"),
      task("c", null, "2026-11-16T07:00:00Z"),
      task("d", "me", "2026-11-16T09:00:00Z"),
    ];
    expect(sortTasks(tasks, "me").map((t) => t.id)).toEqual(["d", "b", "c", "a"]);
    expect(tasks.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("puts a merchant waiting for a call before everything, even someone else's", () => {
    const tasks = [
      task("mine-late", "me", "2026-11-16T07:00:00Z"),
      task("asked", "other", "2026-11-16T12:00:00Z", "call_back"),
    ];
    expect(sortTasks(tasks, "me").map((t) => t.id)).toEqual(["asked", "mine-late"]);
  });
});

describe("taskLabel", () => {
  it("names a setup-help call as its own kind and keeps the plain call-back label", () => {
    expect(taskLabel({ kind: "call_back", topic: "setup" }).title).toBe("Setup help");
    expect(taskLabel({ kind: "call_back", topic: null }).title).toBe("Call back");
    expect(taskLabel({ kind: "store_check", topic: null }).title).toBe("Store check");
  });
});

describe("callBackNumber", () => {
  it("groups the number for reading and dials it with the country code", () => {
    expect(callBackNumber("07701234567")).toEqual({ label: "0770 123 4567", href: "tel:+9647701234567" });
  });
});

describe("formatDue", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  it.each([
    ["2026-11-16T12:00:30Z", "Due now"],
    ["2026-11-16T12:40:00Z", "Due in 40 min"],
    ["2026-11-16T10:00:00Z", "Late by 2 h"],
  ])("%s reads %s", (due, expected) => {
    expect(formatDue(due, now)).toBe(expected);
  });
});

describe("TaskLogSchema", () => {
  it("trims the note and gives an empty one when none is sent", () => {
    const id = "66666666-6666-4666-8666-666666666666";
    expect(TaskLogSchema.parse({ taskId: id, outcome: "done" })).toEqual({ taskId: id, outcome: "done", note: "" });
    expect(TaskLogSchema.parse({ taskId: id, outcome: "later", note: "  call at 6 " }).note).toBe("call at 6");
  });
});

describe("supportTimeline", () => {
  const message = (id: string, at: string): SupportMessageRow => ({
    id,
    case_id: "c",
    sender_kind: "merchant",
    sender_name: "Ali",
    body: "hi",
    context: {},
    created_at: at,
    screenshot_url: null,
    voice_url: null,
  });
  const note = (id: string, at: string): SupportCaseNote => ({
    id,
    kind: "note",
    admin_name: "Noor",
    body: "asked Prime",
    to_name: null,
    created_at: at,
  });

  it("puts staff notes between messages by time", () => {
    const items = supportTimeline(
      [message("m1", "2026-11-16T19:00:00Z"), message("m2", "2026-11-16T19:10:00Z")],
      [note("n1", "2026-11-16T19:05:00Z")],
    );
    expect(items.map((i) => (i.type === "message" ? i.message.id : i.note.id))).toEqual(["m1", "n1", "m2"]);
  });

  it("keeps the message first when a note has the same time", () => {
    const at = "2026-11-16T19:00:00Z";
    const items = supportTimeline([message("m1", at)], [note("n1", at)]);
    expect(items.map((i) => i.type)).toEqual(["message", "note"]);
  });

  it("reads timestamps with different offsets as the same clock", () => {
    const items = supportTimeline(
      [message("m1", "2026-11-16T22:00:00+03:00")],
      [note("n1", "2026-11-16T18:59:00.123456+00:00")],
    );
    expect(items.map((i) => i.type)).toEqual(["note", "message"]);
  });
});
