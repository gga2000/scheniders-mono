import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/*
 * The follow-up form sent assigned_to: "" and the route inserted it as-is, but
 * lead_follow_ups.assigned_to is a NOT NULL uuid FK, so creating a follow-up
 * always failed. An unassigned follow-up now belongs to the admin creating it.
 *
 * Any other owner came from the body unchecked: a follow-up could go to a
 * login that is not staff. It must now be active staff, the lead owner rule.
 */

const ADMIN_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const OTHER_ID = "bbbbbbbb-1111-4222-8333-444444444444";
const LEAD = "11111111-1111-4111-8111-111111111111";
const REQUEST = "cccccccc-1111-4222-8333-444444444444";

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: ADMIN_ID, email: "a@b.co" }, role: "super_admin" }),
}));

const inserted: Record<string, unknown>[] = [];
let activeStaff: string[];
/** What the insert answers with (null: it is saved). */
let insertError: { code: string; message: string } | null;
/** Tables written to besides the follow-up itself. */
let otherWrites: string[];
/** What the follow-up's read back after a repeat asked for. */
let reads: Array<[string, unknown]>;
vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "admin_users") {
        const asked: Record<string, unknown> = {};
        const staff: Record<string, unknown> = {
          select: () => staff,
          eq: (column: string, value: unknown) => {
            asked[column] = value;
            return staff;
          },
          maybeSingle: async () => ({
            data: asked.is_active === true && activeStaff.includes(String(asked.user_id)) ? { user_id: asked.user_id } : null,
            error: null,
          }),
        };
        return staff;
      }
      const chain: Record<string, unknown> = {
        insert: (row: Record<string, unknown>) => {
          if (table === "lead_follow_ups") inserted.push(row);
          return chain;
        },
        select: () => chain,
        eq: (column: string, value: unknown) => {
          reads.push([column, value]);
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: { id: "f1" }, error: null }),
        order: () => chain,
        limit: () => chain,
        update: () => {
          otherWrites.push(table);
          return chain;
        },
        single: () =>
          Promise.resolve(insertError ? { data: null, error: insertError } : { data: { id: "f1", scheduled_at: "2026-11-05T10:00:00Z" }, error: null }),
      };
      return chain;
    },
  }),
}));

const { POST } = await import("./route");

const call = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://admin.test/api/leads/11111111-1111-4111-8111-111111111111/follow-ups", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      // Every save carries its ask's id unless a test takes it out.
      body: JSON.stringify({ request_id: REQUEST, ...body }),
    }),
    { params: Promise.resolve({ id: LEAD }) },
  );

beforeEach(() => {
  inserted.length = 0;
  activeStaff = [OTHER_ID];
  insertError = null;
  otherWrites = [];
  reads = [];
  // Calls are counted per test: "logs nothing" means in this test.
  vi.spyOn(console, "error").mockImplementation(() => {}).mockClear();
});

describe("POST /api/leads/[id]/follow-ups", () => {
  it("assigns an unassigned follow-up to the creating admin", async () => {
    await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z", assigned_to: "" });
    await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z" });
    expect(inserted.map((r) => r.assigned_to)).toEqual([ADMIN_ID, ADMIN_ID]);
  });

  it("keeps an explicit assignee who is active staff", async () => {
    await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z", assigned_to: OTHER_ID });
    expect(inserted[0].assigned_to).toBe(OTHER_ID);
  });

  it("refuses an assignee who is not active staff, and saves nothing", async () => {
    activeStaff = [];
    const res = await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z", assigned_to: OTHER_ID });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A follow-up can only go to an active staff member." });
    expect(inserted).toEqual([]);
  });

  // Round 18 (structure new 6): the lead's next follow-up was set in a second
  // request, and its failure answered "Failed to create follow-up" for a saved
  // follow-up, so staff pressed Schedule again. The database sets it in the
  // same write now (lead_follow_ups_set_next, behaviour suite
  // lead-next-follow-up): the answer is the insert's alone.
  it("answers saved once the follow-up is saved, with no second write to the lead", async () => {
    const res = await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z" });
    expect(res.status).toBe(201);
    expect(inserted).toHaveLength(1);
    expect(otherWrites).toEqual([]);
  });

  // Round 16 (Data new 2): a lead a colleague deleted answered 500 "Failed to
  // create follow-up", with a false error in Sentry.
  it("says the lead was deleted, in the words of every other save, and logs nothing", async () => {
    insertError = {
      code: "23503",
      message: 'insert or update on table "lead_follow_ups" violates foreign key constraint "lead_follow_ups_lead_id_fkey"',
    };
    const res = await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "This lead was deleted. Changes here can no longer be saved." });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("refuses a follow-up with no title or no time", async () => {
    expect((await call({ title: " ", scheduled_at: "2026-11-05T10:00:00Z" })).status).toBe(400);
    expect((await call({ title: "Call", scheduled_at: "tomorrow" })).status).toBe(400);
    expect((await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z", assigned_to: "not-an-id" })).status).toBe(400);
    expect(inserted).toEqual([]);
  });

  // N8: a follow-up whose answer was lost was saved again when staff pressed Schedule.
  it("saves the ask's id, and answers a repeat with the first follow-up", async () => {
    await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z" });
    expect(inserted[0].request_id).toBe(REQUEST);

    insertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "lead_follow_ups_request_id_key"',
    };
    const res = await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ follow_up: { id: "f1" }, duplicate: true });
    expect(reads).toEqual([
      ["request_id", REQUEST],
      ["lead_id", LEAD],
    ]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("asks a tab from before ids to reload, and saves nothing", async () => {
    const res = await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z", request_id: undefined });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "This page is out of date. Reload it and try again" });
    expect(inserted).toEqual([]);
  });
});
