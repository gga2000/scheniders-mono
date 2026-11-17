import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Editing a lead. The body went to the database unchecked, so a status of
 * "converted" could be set by hand: the lead then showed as a store with no
 * store, Convert refused it, and it counted on the Team page. Status and
 * owner now change through admin_change_leads, the same rule as the bulk bar:
 * the database compares with what is stored under a lock and writes the
 * history line, assigned_at and the reassign_lead row with the change, so a
 * refused change leaves nothing behind and two staff moving one lead log the
 * right "from".
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "sales_agent" }),
  requireAdminPermission: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" }),
}));

const LEAD = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const OTHER = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

type Call = { fn: string; args: Record<string, unknown> };
let calls: Call[];
let updates: Record<string, unknown>[];
let rpcAnswer: { data: unknown; error: unknown };
let stored: Record<string, unknown> | null;

function from() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: (row: Record<string, unknown>) => {
      updates.push(row);
      return { eq: async () => ({ error: null }) };
    },
    maybeSingle: async () => ({ data: stored, error: null }),
  };
  return builder;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  calls.push({ fn, args });
  return rpcAnswer;
}

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ from, rpc }) }));

const { PATCH } = await import("./route");
const patch = (body: unknown) =>
  PATCH(
    new NextRequest(`http://admin.test/api/leads/${LEAD}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: LEAD }) },
  );

beforeEach(() => {
  calls = [];
  updates = [];
  rpcAnswer = { data: { success: true, found: 1, status_changed: 1, moved: 0 }, error: null };
  stored = { id: LEAD, merchant_name: "Kawkab", status: "store_built" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/leads/[id]", () => {
  it("refuses Converted by hand, before any call", async () => {
    const res = await patch({ status: "converted" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/only through Convert/);
    expect(calls).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("changes the status through the one rule and answers with the saved lead", async () => {
    const res = await patch({ status: "store_built" });

    expect(res.status).toBe(200);
    expect(calls).toEqual([
      {
        fn: "admin_change_leads",
        args: expect.objectContaining({ _lead_ids: [LEAD], _status: "store_built", _set_owner: false, _admin_user_id: "a1" }),
      },
    ]);
    expect(updates).toEqual([]);
    expect((await res.json()).lead).toMatchObject({ id: LEAD, status: "store_built" });
  });

  it("hands the owner to the database even when the form sends it unchanged, so the database compares", async () => {
    await patch({ merchant_name: "Noor", assigned_to: OTHER, status: "interested" });

    expect(calls[0].args).toMatchObject({ _status: "interested", _set_owner: true, _owner: OTHER, _take_owned: true });
    expect(updates).toEqual([{ merchant_name: "Noor" }]);
  });

  it("can leave a lead with no owner", async () => {
    await patch({ assigned_to: null });

    expect(calls[0].args).toMatchObject({ _status: null, _set_owner: true, _owner: null });
  });

  it("answers 409 and saves nothing else when the lead is already a store", async () => {
    rpcAnswer = { data: null, error: { hint: "LEAD_CONVERTED_LOCKED", message: "locked" } };

    const res = await patch({ status: "lost", merchant_name: "Noor" });

    expect(res.status).toBe(409);
    expect(updates).toEqual([]);
  });

  it("refuses an owner who is not active staff", async () => {
    rpcAnswer = { data: { success: false, error: "owner_not_staff" }, error: null };

    const res = await patch({ assigned_to: OTHER });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/active staff member/);
  });

  it("answers 404 for a lead that is not there", async () => {
    rpcAnswer = { data: { success: true, found: 0, status_changed: 0, moved: 0 }, error: null };

    const res = await patch({ status: "lost" });

    expect(res.status).toBe(404);
  });

  it("saves other fields without the status rule, and drops fields the server keeps", async () => {
    await patch({ priority: "high", last_contacted_at: "2020-01-01T00:00:00Z", lead_score: 100, assigned_at: "2020-01-01" });

    expect(calls).toEqual([]);
    expect(updates).toEqual([{ priority: "high" }]);
  });

  it("refuses an empty change", async () => {
    const res = await patch({ lead_score: 100 });

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
    expect(updates).toEqual([]);
  });
});
