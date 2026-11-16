import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TENANT = "22222222-2222-4222-8222-222222222222";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from }) }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN_ID, email: "boss@example.com" }, role: "super_admin" })),
}));

const { POST } = await import("./route");

function extend(body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/merchants/${TENANT}/extend-subscription`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: TENANT }) },
  );
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/merchants/[id]/extend-subscription", () => {
  it("extends through one database step that names the admin, and writes no table itself", async () => {
    rpc.mockResolvedValue({
      data: { success: true, tenant_id: TENANT, current_period_end: "2026-12-16T09:00:00+00:00", status: "active" },
      error: null,
    });
    const res = await extend({ days: 30 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenant_id: TENANT, current_period_end: "2026-12-16T09:00:00+00:00", status: "active" });
    expect(rpc).toHaveBeenCalledWith("admin_extend_subscription", {
      _tenant_id: TENANT,
      _days: 30,
      _admin_user_id: ADMIN_ID,
      _actor_email: "boss@example.com",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ["demo_store", 409, /demo store/],
    ["paused", 409, /paused/],
    ["still_trial", 409, /trial/],
    ["not_active", 409, /Reactivate/],
    ["no_subscription", 404, /No subscription/],
    ["not_found", 404, /not found/],
  ])("answers the database's %s refusal as %i with what to do", async (code, status, message) => {
    rpc.mockResolvedValue({ data: { success: false, error: code }, error: null });
    const res = await extend({ days: 30 });
    expect(res.status).toBe(status);
    expect((await res.json()).error).toMatch(message);
  });

  it("refuses more than a year before touching the database", async () => {
    expect((await extend({ days: 366 })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is a 500 for a refusal it does not know, never a silent success", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "something_new" }, error: null });
    expect((await extend({ days: 30 })).status).toBe(500);
  });
});
