import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

const guard = vi.hoisted(() => ({ allowed: true, actions: [] as string[] }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: async (_request: unknown, action: string) => {
    guard.actions.push(action);
    return guard.allowed
      ? { user: { id: "a", email: "a@b.co" }, role: "support_staff" }
      : NextResponse.json({ error: "Your login cannot do this. Ask a super admin." }, { status: 403 });
  },
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const SHOP = "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d";
const call = (id = SHOP) => GET(new NextRequest(`http://admin.test/api/merchants/${id}/trial-report`), { params: Promise.resolve({ id }) });

const facts: Row = {
  from_day: "2026-11-12",
  to_day: "2026-11-16",
  days: 5,
  trial_ends_at: "2026-11-19T09:00:00+00:00",
  ended: false,
  plan: "starter",
  orders: 23,
  delivered: 14,
  sales_iqd: 420_000,
  profit_iqd: 96_000,
  missing_cost_units: 0,
  with_courier_iqd: 0,
  with_courier_orders: 0,
  shield_flagged: 3,
  whatsapp_utility: 0,
  whatsapp_marketing: 0,
  prices: { plan_month_iqd: 9_000, per_delivered_iqd: 55, whatsapp_utility_iqd: 30, whatsapp_marketing_iqd: 80 },
};

beforeEach(() => {
  stub = supabaseStub();
  guard.allowed = true;
  guard.actions = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  stub.state.functions.admin_trial_report = () => ({ data: facts, error: null });
});

describe("GET /api/merchants/[id]/trial-report", () => {
  it("answers the shop's report: its lines without the zero ones, the expected cost and the WhatsApp copy", async () => {
    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(guard.actions).toEqual(["handle_support"]);
    expect(stub.state.rpcCalls).toEqual([{ fn: "admin_trial_report", args: { p_tenant: SHOP } }]);
    expect(body.period).toBe("من 12 تشرين الثاني لليوم (5 أيام)");
    // Money with the courier is 0: no line for it.
    expect(body.lines.map((l: Row) => l.key)).toEqual(["orders", "delivered", "shield", "profit"]);
    expect(body.expectedCost).toMatchObject({ totalIqd: 9_000 + 84 * 55, parts: "الباقة 9,000 + 55 × 84 طلب واصل" });
    expect(body.text.split("\n")).toEqual([
      "تقرير تجربتك من 12 تشرين الثاني لليوم (5 أيام)",
      "بهالأسبوع: طلباتك 23، الواصل 14، Shield نبّه على 3، ربحك تقريباً 96,000 د.ع",
      "كلفتك الشهرية المتوقعة بهالحجم: تقريباً 13,620 د.ع (الباقة 9,000 + 55 × 84 طلب واصل)",
    ]);
  });

  it("is for the staff who follow up shops", async () => {
    guard.allowed = false;
    expect((await call()).status).toBe(403);
    expect(stub.state.rpcCalls).toHaveLength(0);
  });

  it("refuses a malformed id, answers 404 for an unknown shop and 500 for a failed or misshapen read", async () => {
    expect((await call("not-a-shop")).status).toBe(400);

    stub.state.functions.admin_trial_report = () => ({ data: null, error: { code: "P0002", message: "no such shop" } });
    expect((await call()).status).toBe(404);

    stub.state.functions.admin_trial_report = () => ({ data: null, error: { message: "connection lost" } });
    expect((await call()).status).toBe(500);

    stub.state.functions.admin_trial_report = () => ({ data: { ...facts, days: 0 }, error: null });
    expect((await call()).status).toBe(500);
  });
});
