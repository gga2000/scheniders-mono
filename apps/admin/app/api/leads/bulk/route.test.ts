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
const LEAD3 = "55555555-5555-4555-8555-555555555555";

let role = "support_staff";
vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: ME, email: "me@staff.test" }, role }),
  forbidden: (permission: string) => Response.json({ error: `needs ${permission}` }, { status: 403 }),
}));
const logged: unknown[][] = [];
vi.mock("@/lib/activity-logger", () => ({ logAdminAction: async (...args: unknown[]) => void logged.push(args) }));

const rpc = vi.fn();
/** Every read and write on leads, as the chain the route built. */
let reads: Array<{ method: string; args: unknown[] }[]>;
/** What a read of leads answers (the delete is a database call, `rpc`). */
let storeRows: Array<{ merchant_name: string }>;
function chain(steps: { method: string; args: unknown[] }[], answer: () => unknown): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: unknown) => void) => resolve(answer());
      return (...args: unknown[]) => {
        steps.push({ method: String(prop), args });
        return chain(steps, answer);
      };
    },
  });
}
vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    rpc,
    from: () => {
      const steps: { method: string; args: unknown[] }[] = [];
      reads.push(steps);
      return chain(steps, () => ({
        data: storeRows,
        error: null,
      }));
    },
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
  role = "support_staff";
  reads = [];
  storeRows = [];
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
    expect(reads).toEqual([]);
    // Each moved lead has its own named reassign_lead row, written by the database.
    expect(logged).toEqual([]);
    expect(await res.json()).toEqual({ success: true, found: 2, changed: 1 });
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
    expect(reads).toEqual([]);
    expect(await res.json()).toEqual({ success: true, found: 2, changed: 2 });
    expect(logged).toEqual([
      [expect.anything(), "bulk_leads", { details: { action: "change_status", status: "contacted", changed: 2 } }],
    ]);
  });

  it("logs and answers only the leads that really changed", async () => {
    rpc.mockResolvedValue(done({ found: 3, status_changed: 1 }));
    const res = await call({ action: "change_status", lead_ids: [LEAD, LEAD2, LEAD3], payload: { status: "contacted" } });

    expect(await res.json()).toEqual({ success: true, found: 3, changed: 1 });
    expect(logged[0][2]).toEqual({ details: { action: "change_status", status: "contacted", changed: 1 } });
  });

  it("writes no log row when nothing changed", async () => {
    rpc.mockResolvedValue(done({ status_changed: 0 }));
    const res = await call({ action: "change_status", lead_ids: [LEAD, LEAD2], payload: { status: "contacted" } });

    expect(await res.json()).toEqual({ success: true, found: 2, changed: 0 });
    expect(logged).toEqual([]);
  });

  it("names the ticked leads that are already stores when the database refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { hint: "LEAD_CONVERTED_LOCKED", message: "locked" } });
    storeRows = [{ merchant_name: "Kawkab" }];
    const res = await call({ action: "assign_to_me", lead_ids: [LEAD, LEAD2], take_from_others: true });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      '"Kawkab" is already a store, so its owner and status can\'t change. Untick it and try again.',
    );
    expect(reads[0]).toEqual([
      { method: "select", args: ["merchant_name"] },
      { method: "in", args: ["id", [LEAD, LEAD2]] },
      { method: "not", args: ["converted_tenant_id", "is", null] },
      { method: "order", args: ["merchant_name"] },
    ]);
    expect(logged).toEqual([]);
  });

  it("deletes the ticked leads and writes the row naming each in the same database call", async () => {
    role = "super_admin";
    const removed = [
      { id: LEAD, merchant_name: "Kawkab" },
      { id: LEAD2, merchant_name: "Noor" },
    ];
    rpc.mockResolvedValue({ data: { removed, kept_with_store: [] }, error: null });
    const res = await call({ action: "delete", lead_ids: [LEAD, LEAD2, LEAD3] });

    expect(await res.json()).toEqual({ success: true, found: 2, changed: 2 });
    // First the check for prospect stores (it only picks the words), then one
    // call that deletes, skips a store built meanwhile, and logs.
    expect(reads).toHaveLength(1);
    expect(reads[0].map((s) => s.method)).toEqual(["select", "in", "not", "order"]);
    expect(rpc).toHaveBeenCalledWith("admin_delete_leads", {
      _lead_ids: [LEAD, LEAD2, LEAD3],
      _admin_user_id: ME,
      _actor_email: "me@staff.test",
      _bulk: true,
    });
    expect(logged).toEqual([]);
  });

  it("refuses the whole press when a ticked lead has a prospect store, naming it, and deletes nothing", async () => {
    role = "super_admin";
    // Its store would stay online with the business's name and phone, and no screen could find it.
    storeRows = [{ merchant_name: "Kawkab" }];
    const res = await call({ action: "delete", lead_ids: [LEAD, LEAD2] });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      '"Kawkab" has a prospect store, so it can\'t be deleted. Untick it and try again. Nothing was deleted.',
    );
    expect(reads[0]).toContainEqual({ method: "not", args: ["prospect_tenant_id", "is", null] });
    expect(rpc).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("answers nothing changed when every ticked lead was gone already", async () => {
    role = "super_admin";
    rpc.mockResolvedValue({ data: { removed: [], kept_with_store: [] }, error: null });
    const res = await call({ action: "delete", lead_ids: [LEAD] });

    expect(await res.json()).toEqual({ success: true, found: 0, changed: 0 });
    expect(logged).toEqual([]);
  });

  it("refuses a delete without delete_leads and touches nothing", async () => {
    const res = await call({ action: "delete", lead_ids: [LEAD] });

    expect(res.status).toBe(403);
    expect(reads).toEqual([]);
  });

  it("no longer takes an assignee from the body", async () => {
    const res = await call({ action: "assign", lead_ids: [LEAD], payload: { assigned_to: OTHER } });

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
