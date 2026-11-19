import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Staff console WhatsApp page (handoff B2 item 8): one report per Baghdad month. */

const rpc = vi.fn();
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: vi.fn(async () => ({ user: { id: "a" }, role: "support_staff" })),
}));

const { GET } = await import("./route");
const { monthOf } = await import("@/lib/baghdad-day");

const SHOP = {
  tenant_id: "11111111-1111-4111-8111-111111111111",
  display_id: 100801,
  name: "Shop",
  plan: "starter",
  status: "active",
  messages: 3,
  utility: 2,
  marketing: 1,
  shop_paid_iqd: 140,
  trial_utility: 0,
  trial_marketing: 0,
  internal: 0,
  unpaid: 0,
  reached_24h: 24,
  failed_24h: 15,
  bad_24h: 15,
  paused: true,
  pause_reason: "failures",
  paused_at: "2026-11-16T05:15:00Z",
};

const get = (qs = "") => GET(new NextRequest(`http://admin.test/api/whatsapp${qs}`));

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: { month_start: "2026-10-31T21:00:00+00:00", month_end: "2026-11-30T21:00:00+00:00", shops: [SHOP] },
    error: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET /api/whatsapp", () => {
  it("asks the database for the chosen month and adds the totals", async () => {
    const res = await get("?month=2026-11");
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_whatsapp_report", { p_month: "2026-11-01" });
    const body = await res.json();
    expect(body.month).toBe("2026-11");
    expect(body.shops).toHaveLength(1);
    expect(body.totals).toMatchObject({ messages: 3, shopPaidIqd: 140, pausedShops: 1 });
  });

  it("defaults to this Baghdad month", async () => {
    await get();
    expect(rpc).toHaveBeenCalledWith("admin_whatsapp_report", { p_month: `${monthOf(new Date())}-01` });
  });

  it("refuses a bad month without asking the database", async () => {
    const res = await get("?month=2026-13");
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a failed or strange answer is a 500, never an empty report", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
    expect((await get()).status).toBe(500);
    rpc.mockResolvedValueOnce({ data: { shops: "none" }, error: null });
    expect((await get()).status).toBe(500);
  });
});
