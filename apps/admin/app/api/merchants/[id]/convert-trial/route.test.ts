import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Round 18 (convert-trial, P1 since round 1): the route made the shop active,
 * then read and wrote its subscription, then the log, each on its own. A
 * failed second write left an active shop on its trial subscription, a retry
 * gave the days twice, and the server took no reason. It is one database
 * step now (admin_convert_trial_once); the money rule is unchanged.
 */

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TENANT = "22222222-2222-4222-8222-222222222222";
const REQ = "44444444-4444-4444-8444-444444444444";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from }) }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN_ID, email: "boss@example.com" }, role: "super_admin" })),
}));

const { POST } = await import("./route");

function convert(body: Record<string, unknown>) {
  return POST(
    new NextRequest(`http://localhost/api/merchants/${TENANT}/convert-trial`, {
      method: "POST",
      body: JSON.stringify({ period_days: 30, reason: "Paid in cash", request_id: REQ, ...body }),
    }),
    { params: Promise.resolve({ id: TENANT }) },
  );
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/merchants/[id]/convert-trial", () => {
  it("converts through one database step that names the admin and the reason, and writes no table itself", async () => {
    rpc.mockResolvedValue({
      data: { success: true, tenant_id: TENANT, status: "active", current_period_end: "2026-12-19T05:00:00+00:00" },
      error: null,
    });
    const res = await convert({ period_days: 90, reason: "  Paid in cash for three months  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      status: "active",
      current_period_end: "2026-12-19T05:00:00+00:00",
      repeat: false,
    });
    expect(rpc).toHaveBeenCalledWith("admin_convert_trial_once", {
      _request_id: REQ,
      _tenant_id: TENANT,
      _days: 90,
      _reason: "Paid in cash for three months",
      _admin_user_id: ADMIN_ID,
      _actor_email: "boss@example.com",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("says a repeat of the same request is a repeat", async () => {
    rpc.mockResolvedValue({
      data: { success: true, tenant_id: TENANT, status: "active", current_period_end: "2026-12-19T05:00:00+00:00", repeat: true },
      error: null,
    });
    expect((await (await convert({})).json()).repeat).toBe(true);
  });

  it.each([
    ["demo_store", 409, /demo store/],
    ["prospect_store", 409, /built for a lead/],
    ["paused", 409, /paused/],
    ["not_trial", 409, /no longer on trial/],
    ["not_found", 404, /not found/],
    ["request_reused", 409, /already used/],
  ])("answers the database's %s refusal as %i with what to do", async (code, status, message) => {
    rpc.mockResolvedValue({ data: { success: false, error: code }, error: null });
    const res = await convert({});
    expect(res.status).toBe(status);
    expect((await res.json()).error).toMatch(message);
  });

  it.each([
    ["no reason", { reason: undefined }, /reason/i],
    ["a reason with no letters", { reason: "..." }, /3 letters/],
    ["0 days", { period_days: 0 }, /./],
    ["more than a year", { period_days: 366 }, /./],
    ["no request id", { request_id: undefined }, /Reload/],
  ])("refuses %s before touching the database", async (_name, body, message) => {
    const res = await convert(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(message);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is a 500 for a refusal it does not know, never a silent success", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "something_new" }, error: null });
    expect((await convert({})).status).toBe(500);
  });
});
