import { describe, it, expect } from "vitest";
import { newestCheckValues } from "./sql-migrations.test-data";
import {
  SUPPORT_REASONS,
  CaseActionSchema,
  fillSavedReply,
  formatAgo,
  formatDue,
  changeRequestDueAt,
  changeRequestClock,
  callBackNumber,
  sortTasks,
  taskLabel,
  TaskLogSchema,
  type SupportTask,
  formatDuration,
  leadProblem,
  problemOpener,
  SHOP_PROBLEM_OPENERS,
  problemDetail,
  formatWait,
  latestOrderNumber,
  percentOf,
  filePaths,
  sortInbox,
  supportRefusal,
  waitingOnUsLine,
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
    expect(leadProblem([p("trial_ending"), p("wallet_empty"), p("store_paused")]).code).toBe("store_paused");
    expect(leadProblem([p("trial_ending"), p("orders_stopped")]).code).toBe("orders_stopped");
  });
});

// Round 14 (Data new 4): a WhatsApp pause staff made opened with "most of
// your messages did not arrive", which never happened.
describe("problemOpener", () => {
  it("does not blame failed messages for a WhatsApp pause staff made", () => {
    const staff = problemOpener({ code: "whatsapp_paused", detail: "staff" });
    expect(staff).toBe("هلا، رسائل الواتساب لزبائنك متوقفة حالياً من طرفنا. خلّينا نحجي حتى نرجّعها.");
    expect(staff).not.toContain("ما وصل");
  });

  // Round 15 (Data new 2): the store_paused line said "we noticed your store
  // stopped and takes no new orders". Only staff pause a store, and a pause
  // may leave new orders on.
  it("says we paused the store, and nothing about orders", () => {
    const paused = problemOpener({ code: "store_paused", detail: "catalogue check" });
    expect(paused).toBe("هلا، متجرك موقوف مؤقتاً من طرفنا. خلّينا نحجي عنه ونشوف شنو نحتاج حتى نرفع الإيقاف.");
    expect(paused).not.toContain("لاحظنا");
    expect(paused).not.toContain("طلبات");
  });

  it("keeps each other opener as it was", () => {
    expect(problemOpener({ code: "whatsapp_paused", detail: "failures" })).toBe(SHOP_PROBLEM_OPENERS.whatsapp_paused);
    expect(problemOpener({ code: "store_paused", detail: null })).toBe(SHOP_PROBLEM_OPENERS.store_paused);
  });
});

describe("problemDetail", () => {
  it("puts counts into words and leaves free text alone", () => {
    expect(problemDetail("waseet_failing", "4")).toBe("4 failed in 24 h");
    expect(problemDetail("orders_stopped", "262")).toBe("none in 48 h, 262 in the 2 weeks before");
    expect(problemDetail("wallet_empty", "-1500")).toBe("-1,500 IQD");
    expect(problemDetail("prime_error", "token expired")).toBe("token expired");
    // Round 13: a locked shop read "Locked for billing · trial_ended".
    expect(problemDetail("billing_locked", "trial_ended")).toBe("Trial ended, not paid");
    expect(problemDetail("billing_locked", "unpaid")).toBe("Month not paid");
    expect(problemDetail("whatsapp_paused", "staff")).toBe("by staff");
    expect(problemDetail("billing_locked", "constructor")).toBe("constructor");
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

describe("changeRequestDueAt", () => {
  it("is 24 hours after the merchant asked, read the same way as a task's due time", () => {
    const due = changeRequestDueAt("2026-11-22T08:00:00Z");
    expect(due).toBe("2026-11-23T08:00:00.000Z");
    expect(formatDue(due, Date.parse("2026-11-23T03:00:00Z"))).toBe("Due in 5 h");
    expect(formatDue(due, Date.parse("2026-11-23T10:00:00Z"))).toBe("Late by 2 h");
  });
});

describe("changeRequestClock", () => {
  const asked = "2026-11-22T08:00:00Z";
  it.each([
    ["2026-11-22T08:01:00Z", "23 h", false],
    ["2026-11-22T09:01:00Z", "22 h", false],
    ["2026-11-23T06:59:00Z", "1 h", false],
    ["2026-11-23T07:00:30Z", "59 min", false],
    ["2026-11-23T07:59:50Z", "1 min", false],
    ["2026-11-23T09:59:00Z", "1 h late", true],
    ["2026-11-23T03:00:00Z", "5 h", false],
    ["2026-11-23T07:20:00Z", "40 min", false],
    ["2026-11-23T08:15:00Z", "15 min late", true],
    ["2026-11-23T10:10:00Z", "2 h late", true],
  ])("at %s reads %s", (now, label, late) => {
    expect(changeRequestClock(asked, Date.parse(now))).toEqual({ label, late });
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

describe("waitingOnUsLine", () => {
  it("counts the merchants waiting on us", () => {
    expect(waitingOnUsLine({ count: 0, isError: false })).toBe("No merchant is waiting on us.");
    expect(waitingOnUsLine({ count: 1, isError: false })).toBe("1 merchant waiting on us");
    expect(waitingOnUsLine({ count: 3, isError: false })).toBe("3 merchants waiting on us");
  });

  it("says nobody is waiting only when the read answered", () => {
    expect(waitingOnUsLine({ count: undefined, isError: false })).toBe("Loading...");
    expect(waitingOnUsLine({ count: undefined, isError: true })).toBe("Could not check who is waiting on us");
    expect(waitingOnUsLine({ count: 0, isError: true })).toBe("Could not check who is waiting on us");
  });
});

/*
 * Round 22 (structure new 6): the reasons live here and in the database's
 * check. The scoreboard reads reasons with z.enum(SUPPORT_REASONS), so a
 * reason added in SQL alone fails the whole scoreboard, not one row.
 */
describe("SUPPORT_REASONS", () => {
  it("is the list the newest support_cases_reason_check allows", () => {
    expect([...SUPPORT_REASONS].sort()).toEqual(newestCheckValues("support_cases_reason_check").sort());
  });
});
