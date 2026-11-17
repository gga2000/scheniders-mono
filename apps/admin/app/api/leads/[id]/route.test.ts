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
 *
 * The rest of the form (name, phones, tags, priority...) was written straight
 * to the row with no staff log row. It now goes through admin_edit_lead,
 * which saves only what really changed and logs those fields with it.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "sales_agent" }),
  requireAdminPermission: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" }),
}));

const LEAD = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const OTHER = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

type Call = { fn: string; args: Record<string, unknown> };
let calls: Call[];
let rpcAnswer: { data: unknown; error: unknown };
let editAnswer: { data: unknown; error: unknown };
let stored: Record<string, unknown> | null;
let industries: Array<{ id: string }>;

const CAFES = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const GONE = "2f3e4d5c-6b7a-4980-a1b2-c3d4e5f6a7b8";
/** What Postgres answers when the lead names an industry that no longer exists. */
const INDUSTRY_FK = {
  code: "23503",
  message: 'insert or update on table "leads" violates foreign key constraint "leads_industry_id_fkey"',
};

function from(table: string) {
  let id: unknown;
  const builder = {
    select: () => builder,
    eq: (_column: string, value: unknown) => {
      id = value;
      return builder;
    },
    maybeSingle: async () =>
      table === "industries"
        ? { data: industries.find((row) => row.id === id) ?? null, error: null }
        : { data: stored, error: null },
  };
  return builder;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  calls.push({ fn, args });
  return fn === "admin_edit_lead" ? editAnswer : rpcAnswer;
}

/** The fields sent to admin_edit_lead, or none. */
const edits = () => calls.filter((c) => c.fn === "admin_edit_lead").map((c) => c.args._changes);

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ from, rpc }) }));

const { PATCH } = await import("./route");
const { INDUSTRY_GONE } = await import("@/lib/lead-update");
const patch = (body: unknown) =>
  PATCH(
    new NextRequest(`http://admin.test/api/leads/${LEAD}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: LEAD }) },
  );

beforeEach(() => {
  calls = [];
  rpcAnswer = { data: { success: true, found: 1, status_changed: 1, moved: 0 }, error: null };
  editAnswer = { data: { found: true, changed: ["merchant_name"] }, error: null };
  stored = { id: LEAD, merchant_name: "Kawkab", status: "store_built" };
  industries = [{ id: CAFES }];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/leads/[id]", () => {
  it("refuses Converted by hand, before any call", async () => {
    const res = await patch({ status: "converted" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/only through Convert/);
    expect(calls).toEqual([]);
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
    expect(edits()).toEqual([]);
    expect((await res.json()).lead).toMatchObject({ id: LEAD, status: "store_built" });
  });

  it("hands the owner to the database even when the form sends it unchanged, so the database compares", async () => {
    await patch({ merchant_name: "Noor", assigned_to: OTHER, status: "interested" });

    expect(calls[0].args).toMatchObject({ _status: "interested", _set_owner: true, _owner: OTHER, _take_owned: true });
    expect(edits()).toEqual([{ merchant_name: "Noor" }]);
  });

  it("can leave a lead with no owner", async () => {
    await patch({ assigned_to: null });

    expect(calls[0].args).toMatchObject({ _status: null, _set_owner: true, _owner: null });
  });

  it("answers 409 and saves nothing else when the lead is already a store", async () => {
    rpcAnswer = { data: null, error: { hint: "LEAD_CONVERTED_LOCKED", message: "locked" } };

    const res = await patch({ status: "lost", merchant_name: "Noor" });

    expect(res.status).toBe(409);
    expect(edits()).toEqual([]);
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

  it("saves other fields through admin_edit_lead with who did it, and drops fields the server keeps", async () => {
    await patch({ priority: "high", last_contacted_at: "2020-01-01T00:00:00Z", lead_score: 100, assigned_at: "2020-01-01" });

    expect(calls).toEqual([
      {
        fn: "admin_edit_lead",
        args: { _lead_id: LEAD, _changes: { priority: "high" }, _admin_user_id: "a1", _actor_email: "a@b.co" },
      },
    ]);
  });

  it("answers 404 when the lead is gone before its fields are saved", async () => {
    editAnswer = { data: { found: false, changed: [] }, error: null };

    const res = await patch({ tags: ["vip"] });

    expect(res.status).toBe(404);
  });

  it("answers 500, never a saved lead, when the edit is refused", async () => {
    editAnswer = { data: null, error: { code: "22023", message: "admin_edit_lead cannot change x" } };

    const res = await patch({ merchant_name: "Noor" });

    expect(res.status).toBe(500);
  });

  /*
   * Round 11: a colleague removed the industry while the form was open. The
   * status was saved, then the field save failed on the foreign key and the
   * answer was a bare "Failed to update lead", on every press.
   */
  it("says the industry was just removed, and saves nothing, not even the status", async () => {
    const res = await patch({ status: "contacted", industry_id: GONE, merchant_name: "Noor" });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(INDUSTRY_GONE);
    expect(calls).toEqual([]);
  });

  it("says the same when the industry goes between that check and the save", async () => {
    editAnswer = { data: null, error: INDUSTRY_FK };

    const res = await patch({ industry_id: CAFES });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(INDUSTRY_GONE);
  });

  /*
   * Round 11: a list is saved whole. Noor tagged the lead "called twice"
   * while Ali's form was open with ["abaya"]; Ali's tags, read before hers,
   * replaced them. A save now sends the lists it changed as they opened.
   */
  it("refuses a list a colleague changed since the form opened, and saves nothing, not even the status", async () => {
    stored = { id: LEAD, phone_numbers: [], tags: ["abaya", "called twice"], branches: [] };

    const res = await patch({ status: "contacted", tags: ["abaya", "vip"], was: { tags: ["abaya"] } });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "A colleague changed this lead's tags while you had it open. Nothing was saved. Open the lead again to see their change, then make yours.",
    );
    expect(calls).toEqual([]);
  });

  it("saves a list that is as it opened, and has the database check it again under the lock", async () => {
    const phones = [{ title: "Owner", number: "07701234567" }];
    stored = { id: LEAD, phone_numbers: [{ number: "07701234567", title: "Owner" }], tags: null, branches: [] };

    const res = await patch({ tags: ["vip"], phone_numbers: [], was: { tags: [], phone_numbers: phones } });

    expect(res.status).toBe(200);
    expect(calls).toEqual([
      {
        fn: "admin_edit_lead",
        args: {
          _lead_id: LEAD,
          _changes: { tags: ["vip"], phone_numbers: [] },
          _admin_user_id: "a1",
          _actor_email: "a@b.co",
          _was: { tags: [], phone_numbers: phones },
        },
      },
    ]);
  });

  it("says so when the list changes between that check and the lock", async () => {
    stored = { id: LEAD, phone_numbers: [], tags: [], branches: [] };
    editAnswer = { data: { found: true, changed: [], stale: ["branches", "phone_numbers"] }, error: null };

    const res = await patch({ phone_numbers: [], branches: [], was: { phone_numbers: [], branches: [] } });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/^A colleague changed this lead's phones and branches while you had it open/);
  });

  it("refuses a field other than the lists in the copy as it opened", async () => {
    const res = await patch({ city: "Basra", was: { city: "Baghdad" } });

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("saves an industry that is there, and no industry at all", async () => {
    expect((await patch({ industry_id: CAFES })).status).toBe(200);
    expect((await patch({ industry_id: null })).status).toBe(200);
    expect(edits()).toEqual([{ industry_id: CAFES }, { industry_id: null }]);
  });

  it("refuses an empty change", async () => {
    const res = await patch({ lead_score: 100 });

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
