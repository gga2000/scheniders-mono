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

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: ADMIN_ID, email: "a@b.co" }, role: "super_admin" }),
}));

const inserted: Record<string, unknown>[] = [];
let activeStaff: string[];
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
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        update: () => chain,
        single: () => Promise.resolve({ data: { id: "f1", scheduled_at: "2026-11-05T10:00:00Z" }, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
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
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
  );

beforeEach(() => {
  inserted.length = 0;
  activeStaff = [OTHER_ID];
  vi.spyOn(console, "error").mockImplementation(() => {});
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

  it("refuses a follow-up with no title or no time", async () => {
    expect((await call({ title: " ", scheduled_at: "2026-11-05T10:00:00Z" })).status).toBe(400);
    expect((await call({ title: "Call", scheduled_at: "tomorrow" })).status).toBe(400);
    expect((await call({ title: "Call", scheduled_at: "2026-11-05T10:00:00Z", assigned_to: "not-an-id" })).status).toBe(400);
    expect(inserted).toEqual([]);
  });
});
