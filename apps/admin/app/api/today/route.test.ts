import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * Today (board h1, h8) reads who is waiting, the numbers above the list and
 * what staff handled today from three database functions. A read that fails
 * answers 500, never an empty desk that tells staff nobody is waiting.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

let handlesSupport = true;
vi.mock("@/lib/admin-permissions", () => ({
  hasPermission: (_role: string, action: string) => (action === "handle_support" ? handlesSupport : true),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/today"));

const base = {
  display_id: 100095,
  business_name: "Shop",
  status: "trial",
  plan: "starter",
  contact_phone: "07700000000",
  wallet_iqd: 0,
  at: "2026-11-17T03:21:24+00:00",
};
const lockSoon: Row = {
  ...base,
  group: "lock_soon",
  tenant_id: "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d",
  reason: "trial_ends",
  price_iqd: 9000,
  short_iqd: 9000,
  nothing_to_renew: false,
};
const question: Row = {
  ...base,
  group: "support",
  tenant_id: "7d4e6d9b-eaf5-42f9-abd1-a8afee593d9d",
  questions: 1,
  case_id: "8d4e6d9b-eaf5-42f9-abd1-a8afee593d9d",
  preview: "How do I print a label?",
};

const done = { tenant_id: lockSoon.tenant_id, display_id: 100095, business_name: "Shop", at: "2026-11-16T06:40:00+00:00", who: "Karrar" };
const approved: Row = { ...done, kind: "receipt", outcome: "approved", amount_iqd: 15000, credited_iqd: 15000, reject_reason: null };
const answered: Row = { ...done, kind: "reply", case_id: question.case_id, reason: null };
const solved: Row = { ...done, kind: "change", action: "support_case_solved", details: { reason: "orders" } };

beforeEach(() => {
  stub = supabaseStub();
  handlesSupport = true;
  stub.state.functions.staff_today_desk = () => ({ data: { shops: [lockSoon, question] }, error: null });
  stub.state.functions.staff_today_numbers = () => ({
    data: { orders_today: 4, orders_yesterday_by_now: 5, fees_month: "23870" },
    error: null,
  });
  stub.state.functions.staff_today_handled = () => ({ data: { handled: [answered, approved, solved] }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/today", () => {
  it("sends who is waiting and the numbers, as the database counted them", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.shops.map((s: Row) => s.group)).toEqual(["lock_soon", "support"]);
    expect(body.numbers).toEqual({ orders_today: 4, orders_yesterday_by_now: 5, fees_month: 23870 });
    expect(body.handled.map((h: Row) => h.kind)).toEqual(["reply", "receipt", "change"]);
  });

  it("leaves support questions and support steps out for a login that does not handle support", async () => {
    handlesSupport = false;
    const body = await (await call()).json();
    expect(body.shops.map((s: Row) => s.group)).toEqual(["lock_soon"]);
    expect(body.handled.map((h: Row) => h.kind)).toEqual(["receipt"]);
  });

  it("answers 500 when what was handled cannot be read", async () => {
    stub.state.functions.staff_today_handled = () => ({ data: null, error: { message: "timeout" } });
    expect((await call()).status).toBe(500);
  });

  it("answers 500 when who is waiting cannot be read, not an empty desk", async () => {
    stub.state.functions.staff_today_desk = () => ({ data: null, error: { message: "timeout" } });
    expect((await call()).status).toBe(500);
  });

  it("answers 500 when the numbers cannot be read", async () => {
    stub.state.functions.staff_today_numbers = () => ({ data: null, error: { message: "timeout" } });
    expect((await call()).status).toBe(500);
  });

  it("answers 500 for an answer it cannot read, not a row with blanks", async () => {
    stub.state.functions.staff_today_desk = () => ({ data: { shops: [{ ...lockSoon, reason: "something new" }] }, error: null });
    expect((await call()).status).toBe(500);
  });
});
