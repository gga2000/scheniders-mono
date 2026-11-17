import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Round 10: an edit saved after a colleague removed the industry read no row
 * and ended in a plain 500 ("Failed to update industry"). It now says "This
 * industry no longer exists." as Delete and Move do. A rename onto another
 * industry's name is refused (one industry per name, industries_name_key).
 * The edit and its staff log row are one database call (admin_edit_industry,
 * the industry-edit suite): the route writes no row of its own.
 */

const INDUSTRY = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
/** What admin_edit_industry answers: the result, or an error. */
let answer: { data: unknown; error: { code?: string; message: string } | null } = { data: null, error: null };
const rpc = vi.fn<(...args: unknown[]) => Promise<typeof answer>>(async () => answer);

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN, email: "ops@example.com" }, role: "super_admin" })),
}));
const logAdminAction = vi.fn();
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));

const { PATCH } = await import("./route");

const patch = (body: unknown) =>
  PATCH(new NextRequest(`http://admin.test/api/industries/${INDUSTRY}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: INDUSTRY }),
  });

beforeEach(() => {
  rpc.mockClear();
  logAdminAction.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("PATCH /api/industries/[id]", () => {
  it("sends the edit and who made it in one database call, and answers the saved industry", async () => {
    answer = { data: { success: true, industry: { id: INDUSTRY, name: "Pets" }, changed: ["name"] }, error: null };

    const res = await patch({ name: " Pets " });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ industry: { id: INDUSTRY, name: "Pets" } });
    expect(rpc).toHaveBeenCalledWith("admin_edit_industry", {
      _industry_id: INDUSTRY,
      _changes: { name: "Pets" },
      _admin_user_id: ADMIN,
      _email: "ops@example.com",
    });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a field the form does not edit before calling the database", async () => {
    const res = await patch({ sort_order: 1 });

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says the industry no longer exists when a colleague removed it first", async () => {
    answer = { data: { success: false, error: "not_found" }, error: null };

    const res = await patch({ name: "Pets" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "This industry no longer exists." });
  });

  it("refuses a name another industry has", async () => {
    answer = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };

    const res = await patch({ name: "Beauty" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "An industry with this name already exists." });
  });

  it("answers 500 when the database fails or answers something else", async () => {
    answer = { data: null, error: { message: "connection lost" } };
    expect((await patch({ name: "Pets" })).status).toBe(500);

    answer = { data: { ok: true }, error: null };
    expect((await patch({ name: "Pets" })).status).toBe(500);
  });
});
