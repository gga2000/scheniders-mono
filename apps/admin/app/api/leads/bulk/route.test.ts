import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * The Leads bar's "Assign" sent no one to assign to, so this route answered
 * 400 to every press. "Assign to me" takes the person from the session: a
 * body cannot hand the leads to someone else.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: ME, email: "me@staff.test" }, role: "support_staff" }),
  forbidden: (permission: string) => Response.json({ error: `needs ${permission}` }, { status: 403 }),
}));
const logged: unknown[] = [];
vi.mock("@/lib/activity-logger", () => ({ logAdminAction: async (...args: unknown[]) => void logged.push(args) }));

let updates: Array<{ values: Record<string, unknown>; ids: unknown[] }>;
vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
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

beforeEach(() => {
  updates = [];
  logged.length = 0;
});

describe("POST /api/leads/bulk", () => {
  it("assigns the leads to the person pressing, from the session", async () => {
    const res = await call({ action: "assign_to_me", lead_ids: [LEAD], payload: { assigned_to: OTHER } });

    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].values.assigned_to).toBe(ME);
    expect(typeof updates[0].values.assigned_at).toBe("string");
    expect(updates[0].ids).toEqual([LEAD]);
    expect(logged).toHaveLength(1);
  });

  it("no longer takes an assignee from the body", async () => {
    const res = await call({ action: "assign", lead_ids: [LEAD], payload: { assigned_to: OTHER } });

    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
  });
});
