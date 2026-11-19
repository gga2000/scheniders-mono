import { describe, expect, it } from "vitest";
import {
  AUTOMATIC,
  changeTitle,
  groupOrderFees,
  timelineCutoff,
  toTimelineEntries,
  withinCutoff,
  type LogRow,
  type NoteRow,
  type WalletRow,
} from "./shop-timeline";

const ALI = "aaaaaaaa-0000-4000-8000-000000000001";
const NOOR = "aaaaaaaa-0000-4000-8000-000000000002";
const names = new Map([
  [ALI, "Ali"],
  [NOOR, "Noor"],
]);

function wallet(over: Partial<WalletRow> & Pick<WalletRow, "id" | "created_at">): WalletRow {
  return { type: "charge", amount_iqd: 55, balance_after_iqd: 0, description: "Order charge", created_by: null, ...over };
}
function log(over: Partial<LogRow> & Pick<LogRow, "id" | "action" | "created_at">): LogRow {
  return { admin_user_id: null, admin_label: null, actor_email: null, details: {}, ...over };
}

describe("toTimelineEntries", () => {
  it("puts money, staff steps and notes in one list, newest first, each with who did it", () => {
    const notes: NoteRow[] = [
      { id: "n1", admin_user_id: NOOR, admin_label: "noor@x.com", content: "Owner pays cash.", created_at: "2026-11-14T08:00:00Z" },
    ];
    const entries = toTimelineEntries({
      wallet: [wallet({ id: "w1", created_at: "2026-11-15T10:00:00Z", balance_after_iqd: 2175 })],
      logs: [
        log({ id: "l1", action: "extend_trial", admin_user_id: ALI, details: { days: 7, reason: "Asked on the phone" }, created_at: "2026-11-16T09:00:00Z" }),
      ],
      notes,
      names,
    });
    expect(entries.map((e) => [e.title, e.who, e.detail])).toEqual([
      ["Gave 7 free trial days", "Ali", "Asked on the phone"],
      ["Order fee", AUTOMATIC, null],
      ["Note", "Noor", "Owner pays cash."],
    ]);
    expect(entries[1]).toMatchObject({ kind: "money", amount: -55, walletAfter: 2175, orderFee: true });
  });

  it("shows a staff top-up once, as the wallet row with the staff member's name", () => {
    const entries = toTimelineEntries({
      wallet: [
        wallet({ id: "w1", type: "topup", amount_iqd: 10000, balance_after_iqd: 85000, description: "Cash at the office", created_at: "2026-11-16T10:00:00Z" }),
      ],
      logs: [
        log({
          id: "l1",
          action: "top_up_wallet",
          admin_user_id: ALI,
          details: { amount_iqd: 10000, new_balance_iqd: 85000, description: "Cash at the office" },
          created_at: "2026-11-16T10:00:01Z",
        }),
      ],
      notes: [],
      names,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: "Money added", who: "Ali", amount: 10000, walletAfter: 85000, detail: "Cash at the office" });
  });

  it("leaves out the log rows a note writes, and never shows a support topic as a reason", () => {
    const entries = toTimelineEntries({
      wallet: [],
      logs: [
        log({ id: "l1", action: "add_note", admin_user_id: ALI, created_at: "2026-11-16T10:00:00Z" }),
        log({ id: "l2", action: "mention_in_note", admin_label: "Noor", created_at: "2026-11-16T10:00:00Z" }),
        log({ id: "l3", action: "support_case_solved", admin_user_id: NOOR, details: { reason: "orders" }, created_at: "2026-11-16T11:00:00Z" }),
      ],
      notes: [],
      names,
    });
    expect(entries.map((e) => [e.title, e.who, e.detail])).toEqual([["Support question solved", "Noor", null]]);
  });

  it("names the system's own steps Automatic and falls back to the email the database kept", () => {
    const entries = toTimelineEntries({
      wallet: [],
      logs: [
        log({ id: "l1", action: "status_change", admin_label: "system", details: { status: "suspended" }, created_at: "2026-11-16T10:00:00Z" }),
        log({ id: "l2", action: "auto_renew_toggle", actor_email: "boss@x.com", details: { auto_renew: false }, created_at: "2026-11-16T09:00:00Z" }),
      ],
      notes: [],
      names,
    });
    expect(entries.map((e) => [e.title, e.who])).toEqual([
      ["Put on hold", AUTOMATIC],
      ["Monthly renewal turned off", "boss@x.com"],
    ]);
  });
});

describe("changeTitle", () => {
  it("says what each step did in plain words", () => {
    expect(changeTitle("extend_trial", { days: 1 })).toBe("Gave 1 free trial day");
    expect(changeTitle("extend_subscription", { days: 30 })).toBe("Gave 30 free days this month");
    expect(changeTitle("add_lock_orders", { orders: 25 })).toBe("Gave 25 more store orders");
    expect(changeTitle("force_unlock", { days: 7 })).toBe("Unlocked for 7 days, no charge");
    expect(changeTitle("convert_trial", { days: 30, plan: "growth" })).toBe("Started 30 days of paid time on the Team plan, no charge");
    expect(changeTitle("convert_trial", { days: 365, plan: "internal" })).toBe("Started 365 days of paid time on Internal (no billing), no charge");
    expect(changeTitle("convert_trial", {})).toBe("Started paid time, no charge");
    expect(changeTitle("pause_tenant", { duration_days: null })).toBe("Paused, no end date");
    expect(changeTitle("unpause_tenant", { status: "active" })).toBe("Pause lifted");
    expect(changeTitle("unpause_tenant", { status: "active", ended: true })).toBe("Pause ended on its end date");
    expect(changeTitle("status_change", { status: "active", previous_status: "suspended" })).toBe("Reactivated");
    expect(changeTitle("plan_change", { plan: "starter" })).toBe("Moved to the Start plan");
    expect(changeTitle("plan_change", { plan: "growth" })).toBe("Moved to the Team plan");
    expect(changeTitle("plan_change", { plan: "internal" })).toBe("Moved to Internal (no billing)");
    expect(changeTitle("support_view", {})).toBe("Looked at the shop as the merchant");
    expect(changeTitle("support_view_end", {})).toBeNull();
    expect(changeTitle("something_new", null)).toBe("Something new");
  });
});

describe("paging", () => {
  const rows = (...times: string[]) => times.map((created_at) => ({ created_at }));

  it("stops where a full table may have older rows not read", () => {
    const cutoff = timelineCutoff(
      [rows("2026-11-16T10:00:00Z", "2026-11-15T10:00:00Z"), rows("2026-11-16T09:00:00Z"), rows("2026-11-16T08:00:00Z", "2026-11-14T08:00:00Z")],
      2,
    );
    expect(cutoff).toBe("2026-11-15T10:00:00Z");
    const kept = withinCutoff(
      toTimelineEntries({
        wallet: [wallet({ id: "new", created_at: "2026-11-16T10:00:00Z" }), wallet({ id: "edge", created_at: "2026-11-15T10:00:00Z" })],
        logs: [],
        notes: [{ id: "old", admin_user_id: null, admin_label: null, content: "x", created_at: "2026-11-14T08:00:00Z" }],
        names,
      }),
      cutoff,
    );
    expect(kept.map((e) => e.id)).toEqual(["wallet-new", "wallet-edge"]);
  });

  it("has nothing older when no table filled its page", () => {
    expect(timelineCutoff([rows("2026-11-16T10:00:00Z"), []], 2)).toBeNull();
  });
});

describe("groupOrderFees", () => {
  it("adds a Baghdad day's order fees into one line at the place of its newest fee", () => {
    const entries = toTimelineEntries({
      wallet: [
        // 01:30 on Tue 17 Nov in Baghdad, though still the 16th in UTC.
        wallet({ id: "a", created_at: "2026-11-16T22:30:00Z", balance_after_iqd: 890 }),
        wallet({ id: "b", created_at: "2026-11-16T12:00:00Z", balance_after_iqd: 945 }),
        wallet({ id: "c", created_at: "2026-11-16T09:00:00Z", balance_after_iqd: 1000 }),
        wallet({ id: "t", type: "topup", amount_iqd: 1000, balance_after_iqd: 1055, description: "Top-up by Qi card", created_at: "2026-11-16T08:00:00Z" }),
      ],
      logs: [],
      notes: [],
      names,
    });
    const grouped = groupOrderFees(entries);
    expect(grouped.map((e) => [e.title, e.detail, e.amount, e.walletAfter])).toEqual([
      ["Order fees", "1 order", -55, 890],
      ["Order fees", "2 orders", -110, 945],
      ["Money added", "Top-up by Qi card", 1000, 1055],
    ]);
  });
});
