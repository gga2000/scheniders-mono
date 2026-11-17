import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * The Leads bar's "Assign" sent no one to assign to, so this route answered
 * 400 to every press. "Assign to me" takes the person from the session: a
 * body cannot hand the leads to someone else. Status and owner changes now go
 * through the lead form's rule (admin_change_leads): history lines, last
 * contacted, a reassign_lead row per lead, and no colleague's lead is taken
 * until the person said so.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";
const LEAD2 = "44444444-4444-4444-8444-444444444444";

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: ME, email: "me@staff.test" }, role: "support_staff" }),
  forbidden: (permission: string) => Response.json({ error: `needs ${permission}` }, { status: 403 }),
}));
const logged: unknown[][] = [];
vi.mock("@/lib/activity-logger", () => ({ logAdminAction: async (...args: unknown[]) => void logged.push(args) }));

const rpc = vi.fn();
let updates: Array<{ values: Record<string, unknown>; ids: unknown[] }>;
vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    rpc,
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        in: async (_column: string, ids: unknown[]) => {
          updates.push({ values, ids });
          return { error: null };
        },
      }),
    }),
  }),
}));

const { POST } = await import("./route");
const call = (body: unknown) =>
  POST(new NextRequest("http://admin.test/api/leads/bulk", { method: "POST", body: JSON.stringify(body) }));

const done = (over: Record<string, unknown> = {}) => ({
  data: { success: true, found: 2, status_changed: 0, moved: 0, ...over },
  error: null,
});

beforeEach(() => {
  updates = [];
  logged.length = 0;
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/leads/bulk", () => {
  it("assigns the leads to the person pressing, from the session, without taking anyone's lead unasked", async () => {
    rpc.mockResolvedValue(done({ moved: 1 }));
    const res = await call({ action: "assign_to_me", lead_ids: [LEAD], payload: { assigned_to: OTHER } });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_change_leads", {
      _lead_ids: [LEAD],
      _status: null,
      _set_owner: true,
      _owner: ME,
      _take_owned: false,
      _admin_user_id: ME,
      _actor_email: "me@staff.test",
    });
    expect(updates).toEqual([]);
    expect(logged).toHaveLength(1);
    expect(logged[0][1]).toBe("bulk_leads");
  });

  it("says how many leads someone else owns and moves nothing until asked", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "owned_by_others", count: 3 }, error: null });
    const res = await call({ action: "assign_to_me", lead_ids: [LEAD, LEAD2] });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "3 of these leads belong to someone else.", owned_by_others: 3 });
    expect(logged).toEqual([]);
  });

  it("takes them once the person said so", async () => {
    rpc.mockResolvedValue(done({ moved: 2 }));
    const res = await call({ action: "assign_to_me", lead_ids: [LEAD, LEAD2], take_from_others: true });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_change_leads", expect.objectContaining({ _owner: ME, _take_owned: true }));
  });

  it("marks leads contacted through the same rule as the lead form", async () => {
    rpc.mockResolvedValue(done({ status_changed: 2 }));
    const res = await call({ action: "change_status", lead_ids: [LEAD, LEAD2], payload: { status: "contacted" } });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "admin_change_leads",
      expect.objectContaining({ _lead_ids: [LEAD, LEAD2], _status: "contacted", _set_owner: false }),
    );
    expect(updates).toEqual([]);
  });

  it("answers 409 when a ticked lead is already a store", async () => {
    rpc.mockResolvedValue({ data: null, error: { hint: "LEAD_CONVERTED_LOCKED", message: "locked" } });
    const res = await call({ action: "assign_to_me", lead_ids: [LEAD], take_from_others: true });

    expect(res.status).toBe(409);
    expect(logged).toEqual([]);
  });

  it("no longer takes an assignee from the body", async () => {
    const res = await call({ action: "assign", lead_ids: [LEAD], payload: { assigned_to: OTHER } });

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
