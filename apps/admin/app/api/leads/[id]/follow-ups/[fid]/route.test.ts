import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Marking a follow-up done. Who completed it came from the body, and the
 * console never sent it, so every completed follow-up had no one. It is now
 * the signed-in staff member, whatever the body says.
 */

const ADMIN_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const OTHER_ID = "bbbbbbbb-1111-4222-8333-444444444444";
const LEAD = "11111111-1111-4111-8111-111111111111";
const FOLLOW_UP = "22222222-1111-4111-8111-111111111111";

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: ADMIN_ID, email: "a@b.co" }, role: "super_admin" }),
}));

type Step = { method: string; args: unknown[] };
let writes: { table: string; steps: Step[] }[];
/** The follow-up the update finds (null: none on this lead). */
let found: { id: string } | null;
/** Whether the lead itself is still there. */
let leadThere: boolean;

function chain(steps: Step[], table: string): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
      }
      return (...args: unknown[]) => {
        steps.push({ method: String(prop), args });
        if (prop === "maybeSingle") {
          const updating = steps.some((s) => s.method === "update");
          if (updating) return Promise.resolve({ data: found, error: null });
          return Promise.resolve({ data: table === "leads" && leadThere ? { id: LEAD } : null, error: null });
        }
        return chain(steps, table);
      };
    },
  });
}

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const steps: Step[] = [];
      writes.push({ table, steps });
      return chain(steps, table);
    },
  }),
}));

const { PATCH } = await import("./route");

const change = (body: unknown) =>
  PATCH(
    new NextRequest(`http://admin.test/api/leads/${LEAD}/follow-ups/${FOLLOW_UP}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: LEAD, fid: FOLLOW_UP }) },
  );

const followUpUpdate = () =>
  writes[0].steps.find((s) => s.method === "update")?.args[0] as Record<string, unknown> | undefined;

beforeEach(() => {
  writes = [];
  found = { id: FOLLOW_UP };
  leadThere = true;
  // Calls are counted per test: "logs nothing" means in this test.
  vi.spyOn(console, "error").mockImplementation(() => {}).mockClear();
});

describe("PATCH /api/leads/[id]/follow-ups/[fid]", () => {
  it("records the signed-in staff member as the one who completed it, whatever the body says", async () => {
    const res = await change({ is_completed: true, completed_by: OTHER_ID });

    expect(res.status).toBe(200);
    expect(followUpUpdate()).toMatchObject({ is_completed: true, completed_by: ADMIN_ID });
    expect(followUpUpdate()?.completed_at).toEqual(expect.any(String));
    expect(writes[0].steps).toContainEqual({ method: "eq", args: ["lead_id", LEAD] });
    expect(writes.at(-1)?.table).toBe("leads");
  });

  it("clears who completed it when it is opened again", async () => {
    await change({ is_completed: false });

    expect(followUpUpdate()).toEqual({ is_completed: false, completed_at: null, completed_by: null });
  });

  it("answers 404 for a follow-up that is not on this lead, and leaves the lead alone", async () => {
    found = null;

    const res = await change({ is_completed: true });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "This follow-up no longer exists." });
    expect(writes.map((w) => w.table)).toEqual(["lead_follow_ups", "leads"]);
    expect(writes[1].steps.some((s) => s.method === "update")).toBe(false);
  });

  // Round 16 (Data new 2): deleting a lead deletes its follow-ups, and staff
  // read "This follow-up no longer exists." on a lead that was gone.
  it("says the lead was deleted when it was, in the words of every other save", async () => {
    found = null;
    leadThere = false;

    const res = await change({ is_completed: true });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "This lead was deleted. Changes here can no longer be saved." });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("refuses a change with nothing in it, and writes nothing", async () => {
    const res = await change({ completed_by: OTHER_ID });

    expect(res.status).toBe(400);
    expect(writes).toEqual([]);
  });
});
