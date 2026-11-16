import { describe, expect, it } from "vitest";
import {
  groupCount,
  groupRows,
  handledWords,
  isSupportWork,
  rowWords,
  waitWords,
  whatsappLink,
  type HandledRow,
  type TodayShop,
} from "./today";

/*
 * Each Today row says why the shop is there with the number that matters,
 * and how long it has waited or how long until it locks (board h2, h7).
 */

const now = new Date("2026-11-16T07:42:00Z"); // Mon 16 Nov, 10:42 in Baghdad
const base = {
  tenant_id: "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d",
  display_id: 100095,
  business_name: "Shop",
  status: "trial",
  plan: "starter",
  contact_phone: "0770 000 9456",
  wallet_iqd: 0,
};

const receipt: TodayShop = { ...base, group: "money", at: "2026-11-16T05:42:00Z", receipts: 1, amount_iqd: 50000 };
const locked: TodayShop = {
  ...base,
  group: "locked",
  status: "active",
  wallet_iqd: 2175,
  at: "2026-11-13T07:00:00Z",
  reason: "unpaid",
  orders_left: 47,
};
const trialEnds: TodayShop = {
  ...base,
  group: "lock_soon",
  at: "2026-11-17T03:21:00Z",
  reason: "trial_ends",
  price_iqd: 9000,
  short_iqd: 9000,
  nothing_to_renew: false,
};
const monthDue: TodayShop = {
  ...base,
  group: "lock_soon",
  status: "active",
  wallet_iqd: 4000,
  at: "2026-11-19T07:00:00Z",
  reason: "month_ends",
  price_iqd: 9000,
  short_iqd: 5000,
  nothing_to_renew: false,
};
const question: TodayShop = {
  ...base,
  group: "support",
  status: "active",
  at: "2026-11-16T07:02:00Z",
  questions: 1,
  case_id: "8d4e6d9b-eaf5-42f9-abd1-a8afee593d9d",
  preview: "How do I print a shipping label?",
};

describe("a Today row", () => {
  it("says what money is waiting, and how many more receipts", () => {
    expect(rowWords(receipt, now)).toEqual({ tone: "trial", label: "Trial", why: "Sent a receipt for 50,000 IQD" });
    expect(rowWords({ ...receipt, receipts: 3 }, now).why).toBe("Sent a receipt for 50,000 IQD and 2 more");
    expect(waitWords(receipt, now)).toBe("waiting 2 h");
  });

  it("says why a locked shop is locked and how many store orders it has left", () => {
    expect(rowWords(locked, now)).toEqual({ tone: "locked", label: "Locked", why: "Month not paid. 47 store orders left" });
    expect(rowWords({ ...locked, reason: "trial_ended", orders_left: 0 }, now).why).toBe(
      "Trial ended, not paid. The store takes no more orders",
    );
    expect(waitWords(locked, now)).toBe("locked 3 days");
  });

  it("says when a shop will lock and how much it is short", () => {
    expect(rowWords(trialEnds, now).why).toBe("Trial ends Tue 17 Nov, wallet is empty");
    expect(rowWords({ ...trialEnds, wallet_iqd: 4000, short_iqd: 5000 }, now).why).toBe("Trial ends Tue 17 Nov, 5,000 short");
    expect(rowWords({ ...trialEnds, nothing_to_renew: true }, now).why).toBe("Trial ends Tue 17 Nov, nothing set to renew");
    expect(waitWords(trialEnds, now)).toBe("locks in 19 h");
    expect(rowWords(monthDue, now)).toEqual({ tone: "paying", label: "Paying", why: "9,000 due Thu 19 Nov, 5,000 short" });
    expect(waitWords(monthDue, now)).toBe("locks in 2 days"); // 2 days 23 h, rounded down
  });

  it("quotes the question a shop asked", () => {
    expect(rowWords(question, now).why).toBe("Asked: How do I print a shipping label?");
    expect(waitWords(question, now)).toBe("waiting 40 min");
  });
});

describe("the Today groups", () => {
  it("keep the database's order and leave out empty groups", () => {
    expect(groupRows([question, locked, receipt]).map((g) => g.group)).toEqual(["money", "locked", "support"]);
  });

  it("count receipts, shops and questions in words", () => {
    expect(groupCount("money", [receipt, { ...receipt, receipts: 2 }])).toBe("3 receipts to check");
    expect(groupCount("lock_soon", [trialEnds])).toBe("1 shop");
    expect(groupCount("lock_soon", [trialEnds, monthDue])).toBe("2 shops");
    expect(groupCount("support", [question])).toBe("1 question");
  });
});

describe("the owner's WhatsApp", () => {
  it("opens an Iraqi mobile however it was typed, and nothing else", () => {
    expect(whatsappLink("0770 000 9456")).toBe("https://wa.me/9647700009456");
    expect(whatsappLink("+964 770 000 9456")).toBe("https://wa.me/9647700009456");
    expect(whatsappLink("01 555 1234")).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });
});

describe("a Handled today row", () => {
  const done = { tenant_id: base.tenant_id, display_id: 100095, business_name: "Shop", at: "2026-11-16T06:40:00Z", who: "Karrar" };
  const receipt = (over: Partial<Extract<HandledRow, { kind: "receipt" }>>): HandledRow => ({
    ...done,
    kind: "receipt",
    outcome: "approved",
    amount_iqd: 15000,
    credited_iqd: 15000,
    reject_reason: null,
    ...over,
  });
  const change = (action: string, details: Record<string, unknown> | null): HandledRow => ({ ...done, kind: "change", action, details });

  it("says what happened to a receipt, with the money", () => {
    expect(handledWords(receipt({}))).toBe("Receipt approved, 15,000 IQD");
    expect(handledWords(receipt({ credited_iqd: 20000 }))).toBe("Receipt for 15,000 IQD approved, 20,000 IQD added");
    expect(handledWords(receipt({ outcome: "rejected", amount_iqd: 25000, credited_iqd: null, reject_reason: "The photo could not be read" }))).toBe(
      "Receipt for 25,000 IQD rejected: The photo could not be read",
    );
    expect(handledWords(receipt({ outcome: "rejected", credited_iqd: null }))).toBe("Receipt for 15,000 IQD rejected");
  });

  it("says a change in the words of the shop timeline, with the money added", () => {
    expect(handledWords(change("top_up_wallet", { amount_iqd: 10000 }))).toBe("Added 10,000 IQD");
    expect(handledWords(change("extend_trial", { days: 2 }))).toBe("Gave 2 free trial days");
    expect(handledWords(change("support_reached_out", null))).toBe("Reached out to the shop");
    expect(handledWords({ ...done, kind: "reply", case_id: "8d4e6d9b-eaf5-42f9-abd1-a8afee593d9d" })).toBe("Question answered");
  });

  it("knows which steps are support work", () => {
    expect(isSupportWork({ ...done, kind: "reply", case_id: "8d4e6d9b-eaf5-42f9-abd1-a8afee593d9d" })).toBe(true);
    expect(isSupportWork(change("support_case_solved", null))).toBe(true);
    expect(isSupportWork(change("top_up_wallet", { amount_iqd: 10000 }))).toBe(false);
    expect(isSupportWork(receipt({}))).toBe(false);
  });
});
