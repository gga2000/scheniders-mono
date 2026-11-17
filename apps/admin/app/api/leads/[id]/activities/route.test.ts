import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Logging a note, call or meeting on a lead. The author came from the body,
 * and the console never sent one, so every note was saved with no author.
 * The author is now the signed-in staff member, whatever the body says, and
 * only the kinds staff log by hand are taken.
 */

const ADMIN_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const OTHER_ID = "bbbbbbbb-1111-4222-8333-444444444444";
const LEAD = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: ADMIN_ID, email: "a@b.co" }, role: "super_admin" }),
}));

type Step = { method: string; args: unknown[] };
let writes: { table: string; steps: Step[] }[];
/** What the contacted-mark finds, and what the insert answers. */
let leadFound: { id: string } | null;
let insertError: { code: string; message: string } | null;

function chain(table: string, steps: Step[]): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        steps.push({ method: String(prop), args });
        if (prop === "maybeSingle") return Promise.resolve({ data: leadFound, error: null });
        if (prop === "single") return Promise.resolve(insertError ? { data: null, error: insertError } : { data: { id: "act1" }, error: null });
        return chain(table, steps);
      };
    },
  });
}

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const steps: Step[] = [];
      writes.push({ table, steps });
      return chain(table, steps);
    },
  }),
}));

const { POST } = await import("./route");

const log = (body: unknown) =>
  POST(
    new NextRequest(`http://admin.test/api/leads/${LEAD}/activities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: LEAD }) },
  );

const inserted = () => writes.find((w) => w.table === "lead_activities")?.steps.find((s) => s.method === "insert")?.args[0];

beforeEach(() => {
  writes = [];
  leadFound = { id: LEAD };
  insertError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/leads/[id]/activities", () => {
  it("saves a note by the signed-in staff member, whatever author the body names", async () => {
    const res = await log({ activity_type: "note", title: "Note added", description: " Called back ", created_by: OTHER_ID });

    expect(res.status).toBe(201);
    expect(inserted()).toEqual({
      lead_id: LEAD,
      activity_type: "note",
      title: "Note added",
      description: "Called back",
      created_by: ADMIN_ID,
    });
    expect(writes.map((w) => w.table)).toEqual(["lead_activities"]);
  });

  it("marks the lead contacted before it saves a call", async () => {
    const res = await log({ activity_type: "call", title: "Call added", description: "No answer" });

    expect(res.status).toBe(201);
    expect(writes.map((w) => w.table)).toEqual(["leads", "lead_activities"]);
    expect(writes[0].steps[0].method).toBe("update");
    expect(inserted()).toMatchObject({ activity_type: "call", created_by: ADMIN_ID });
  });

  it("answers 404 for a call on a lead that is gone, and saves no note", async () => {
    leadFound = null;

    const res = await log({ activity_type: "call", title: "Call added", description: "No answer" });

    expect(res.status).toBe(404);
    expect(inserted()).toBeUndefined();
  });

  it("answers 404 for a note on a lead that is gone", async () => {
    insertError = {
      code: "23503",
      message: 'insert or update on table "lead_activities" violates foreign key constraint "lead_activities_lead_id_fkey"',
    };

    const res = await log({ activity_type: "note", title: "Note added", description: "x" });

    expect(res.status).toBe(404);
  });

  it("refuses a kind that only the console's own changes write, and saves nothing", async () => {
    const res = await log({ activity_type: "status_change", title: "Status changed" });

    expect(res.status).toBe(400);
    expect(writes).toEqual([]);
  });
});
