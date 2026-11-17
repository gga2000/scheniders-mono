import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Editing a lead. The body went to the database unchecked, so a status of
 * "converted" could be set by hand: the lead then showed as a store with no
 * store, Convert refused it, and it counted on the Team page. The history
 * line was also written before the save, so a refused change left a false
 * "Status changed" behind, and every form save restarted assigned_at.
 * Moving a lead to another owner left no staff log row at all.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "sales_agent" }),
  requireAdminPermission: async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" }),
}));

const LEAD = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const OWNER = "9f8e7d6c-5b4a-4321-8fed-cba987654321";
const OTHER = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

const logged = vi.fn();
vi.mock("@/lib/activity-logger", () => ({ logAdminAction: (...args: unknown[]) => logged(...args) }));

type Write = { table: string; kind: "update" | "insert"; row: Record<string, unknown> };
let stored: { status: string; assigned_to: string | null };
let updateError: Record<string, unknown> | null;
let writes: Write[];

function from(table: string) {
  let pending: Write | null = null;
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: (row: Record<string, unknown>) => {
      pending = { table, kind: "update", row };
      return builder;
    },
    insert: async (row: Record<string, unknown>) => {
      writes.push({ table, kind: "insert", row });
      return { error: null };
    },
    maybeSingle: async () => ({ data: { ...stored }, error: null }),
    single: async () => {
      if (pending && updateError) return { data: null, error: updateError };
      if (pending) writes.push(pending);
      return { data: { id: LEAD, merchant_name: "Kawkab", ...stored, ...pending?.row }, error: null };
    },
  };
  return builder;
}

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ from }) }));

const { PATCH } = await import("./route");
const patch = (body: unknown) =>
  PATCH(
    new NextRequest(`http://admin.test/api/leads/${LEAD}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: LEAD }) },
  );

beforeEach(() => {
  stored = { status: "interested", assigned_to: OWNER };
  updateError = null;
  writes = [];
  logged.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/leads/[id]", () => {
  it("refuses Converted by hand, before any write", async () => {
    const res = await patch({ status: "converted" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/only through Convert/);
    expect(writes).toEqual([]);
  });

  it("saves a status change, then writes its history line", async () => {
    const res = await patch({ status: "store_built" });

    expect(res.status).toBe(200);
    expect(writes.map((w) => `${w.kind} ${w.table}`)).toEqual(["update leads", "insert lead_activities"]);
    expect(writes[1].row).toMatchObject({ title: "Status changed from interested to store_built", created_by: "a1" });
  });

  it("leaves no history line when the database refuses the change", async () => {
    stored = { status: "converted", assigned_to: OWNER };
    updateError = { hint: "LEAD_CONVERTED_LOCKED", message: "locked" };

    const res = await patch({ status: "lost" });

    expect(res.status).toBe(409);
    expect(writes).toEqual([]);
  });

  it("keeps assigned_at and logs nothing when a form save leaves the owner alone", async () => {
    await patch({ merchant_name: "Noor", assigned_to: OWNER, status: "interested" });

    expect(writes).toHaveLength(1);
    expect(writes[0].row).not.toHaveProperty("assigned_at");
    expect(logged).not.toHaveBeenCalled();
  });

  it("stamps assigned_at and logs who moved the lead when the owner changes", async () => {
    const res = await patch({ assigned_to: OTHER });

    expect(res.status).toBe(200);
    expect(writes[0].row).toMatchObject({ assigned_to: OTHER, assigned_at: expect.any(String) });
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: "a1" }) }), "reassign_lead", {
      details: { lead_id: LEAD, merchant_name: "Kawkab", from: OWNER, to: OTHER },
    });
  });

  it("logs a lead left with no owner", async () => {
    await patch({ assigned_to: null });

    expect(logged).toHaveBeenCalledWith(expect.anything(), "reassign_lead", {
      details: { lead_id: LEAD, merchant_name: "Kawkab", from: OWNER, to: null },
    });
  });

  it("logs no move the database refused", async () => {
    stored = { status: "converted", assigned_to: OWNER };
    updateError = { hint: "LEAD_CONVERTED_LOCKED", message: "locked" };

    await patch({ assigned_to: OTHER });

    expect(logged).not.toHaveBeenCalled();
  });

  it("drops fields the server keeps", async () => {
    await patch({ priority: "high", last_contacted_at: "2020-01-01T00:00:00Z", lead_score: 100 });

    expect(writes[0].row).toEqual({ priority: "high" });
  });
});
