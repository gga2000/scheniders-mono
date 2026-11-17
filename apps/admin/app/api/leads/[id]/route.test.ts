import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Editing a lead. The body went to the database unchecked, so a status of
 * "converted" could be set by hand: the lead then showed as a store with no
 * store, Convert refused it, and it counted on the Team page. Status and
 * owner change by the bulk bar's rule (admin_change_leads), and the rest of
 * the form is saved only where it changed, with its staff log row
 * (admin_edit_lead).
 *
 * Round 12: those were two transactions, and a read after them. A colleague's
 * list change between the two left the status saved under "Nothing was
 * saved", and a failed read after a save answered "Failed". The form now
 * saves in one call, admin_save_lead (one transaction, one lock), and the
 * answer is the save's own: the form reads the lead again itself.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "sales_agent" }),
  requireAdminPermission: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" }),
}));

const LEAD = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const OTHER = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

type Call = { fn: string; args: Record<string, unknown> };
let calls: Call[];
let answer: { data: unknown; error: unknown };

const CAFES = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
/** What Postgres answers when the lead names an industry that no longer exists. */
const INDUSTRY_FK = {
  code: "23503",
  message: 'insert or update on table "leads" violates foreign key constraint "leads_industry_id_fkey"',
};
const SAVED = { success: true, status_changed: 1, moved: 0, changed: ["merchant_name"] };

/** The save reads nothing itself: a table read here would be the old two-step save. */
function from(table: string): never {
  throw new Error(`the lead save read ${table}`);
}

async function rpc(fn: string, args: Record<string, unknown>) {
  calls.push({ fn, args });
  return answer;
}

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
  answer = { data: SAVED, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/leads/[id]", () => {
  it("refuses Converted by hand, before any call", async () => {
    const res = await patch({ status: "converted" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/only through Convert/);
    expect(calls).toEqual([]);
  });

  it("saves status, owner and fields in one call, with who did it, and answers that it saved", async () => {
    const res = await patch({ merchant_name: "Noor", assigned_to: OTHER, status: "interested" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: true });
    expect(calls).toEqual([
      {
        fn: "admin_save_lead",
        args: {
          _lead_id: LEAD,
          _status: "interested",
          _set_owner: true,
          _owner: OTHER,
          _changes: { merchant_name: "Noor" },
          _admin_user_id: "a1",
          _actor_email: "a@b.co",
        },
      },
    ]);
  });

  it("leaves the owner alone when the form does not send one, and can leave a lead with no owner", async () => {
    await patch({ status: "store_built" });
    await patch({ assigned_to: null });

    expect(calls.map((c) => [c.args._status, c.args._set_owner, c.args._owner, c.args._changes])).toEqual([
      ["store_built", false, null, {}],
      [null, true, null, {}],
    ]);
  });

  it("drops fields the server keeps", async () => {
    await patch({ priority: "high", last_contacted_at: "2020-01-01T00:00:00Z", lead_score: 100, assigned_at: "2020-01-01" });

    expect(calls[0].args._changes).toEqual({ priority: "high" });
  });

  it("answers 409 when the lead is already a store", async () => {
    answer = { data: null, error: { hint: "LEAD_CONVERTED_LOCKED", message: "locked" } };

    expect((await patch({ status: "lost", merchant_name: "Noor" })).status).toBe(409);
  });

  it("says an owner must be active staff", async () => {
    answer = { data: { success: false, error: "owner_not_staff" }, error: null };

    const res = await patch({ assigned_to: OTHER, merchant_name: "Noor" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/active staff member/);
  });

  it("answers 404 for a lead that is not there", async () => {
    answer = { data: { success: false, error: "not_found" }, error: null };

    expect((await patch({ status: "lost" })).status).toBe(404);
  });

  it("answers 500 when the database refuses the call", async () => {
    answer = { data: null, error: { code: "22023", message: "admin_edit_lead cannot change x" } };

    expect((await patch({ merchant_name: "Noor" })).status).toBe(500);
  });

  /*
   * Round 11: a colleague removed the industry while the form was open, and
   * the answer was a bare "Failed to update lead". The whole save is undone
   * now, status included, so the words are true.
   */
  it("says the industry was just removed", async () => {
    answer = { data: null, error: INDUSTRY_FK };

    const res = await patch({ status: "contacted", industry_id: CAFES });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(INDUSTRY_GONE);
  });

  it("saves an industry, and no industry at all", async () => {
    expect((await patch({ industry_id: CAFES })).status).toBe(200);
    expect((await patch({ industry_id: null })).status).toBe(200);
    expect(calls.map((c) => c.args._changes)).toEqual([{ industry_id: CAFES }, { industry_id: null }]);
  });

  /*
   * Round 11: a list is saved whole. Noor tagged the lead "called twice"
   * while Ali's form was open with ["abaya"]; Ali's tags, read before hers,
   * replaced them. A save sends the lists it changed as they opened, and the
   * database compares them before it writes anything.
   */
  it("sends the lists as they opened for the database to compare", async () => {
    const phones = [{ title: "Owner", number: "07701234567" }];

    await patch({ tags: ["vip"], phone_numbers: [], was: { tags: [], phone_numbers: phones } });

    expect(calls[0].args).toMatchObject({
      _changes: { tags: ["vip"], phone_numbers: [] },
      _was: { tags: [], phone_numbers: phones },
    });
  });

  it("says which lists a colleague changed, and that nothing was saved, and names them for the form", async () => {
    answer = { data: { success: false, error: "stale", stale: ["branches", "phone_numbers"] }, error: null };

    const res = await patch({ status: "contacted", phone_numbers: [], branches: [], was: { phone_numbers: [], branches: [] } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error:
        "A colleague changed this lead's phones and branches while you had it open. Nothing was saved. The form now shows their phones and branches: make your change to them again, then save.",
      stale: ["branches", "phone_numbers"],
    });
  });

  it("refuses a field other than the lists in the copy as it opened", async () => {
    const res = await patch({ city: "Basra", was: { city: "Baghdad" } });

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("refuses an empty change", async () => {
    const res = await patch({ lead_score: 100 });

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
