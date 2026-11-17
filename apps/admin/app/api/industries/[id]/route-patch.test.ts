import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Round 10: an edit saved after a colleague removed the industry read no row
 * and ended in a plain 500 ("Failed to update industry"). It now says "This
 * industry no longer exists." as Delete and Move do. A rename onto another
 * industry's name is refused (one industry per name, industries_name_key).
 */

const INDUSTRY = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
/** What the update answers: the row, no row, or an error. */
let updated: { data: unknown; error: { code?: string; message: string } | null } = { data: null, error: null };
const writes: unknown[] = [];

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (fields: unknown) => {
        writes.push(fields);
        return { eq: () => ({ select: () => ({ maybeSingle: async () => updated }) }) };
      },
    }),
  }),
}));
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
  writes.length = 0;
  logAdminAction.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("PATCH /api/industries/[id]", () => {
  it("saves the edit and logs it", async () => {
    updated = { data: { id: INDUSTRY, name: "Pets" }, error: null };

    const res = await patch({ name: "Pets" });

    expect(res.status).toBe(200);
    expect(writes).toEqual([{ name: "Pets" }]);
    expect(logAdminAction).toHaveBeenCalledTimes(1);
  });

  it("says the industry no longer exists when a colleague removed it first, and logs nothing", async () => {
    updated = { data: null, error: null };

    const res = await patch({ name: "Pets" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "This industry no longer exists." });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a name another industry has, and logs nothing", async () => {
    updated = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };

    const res = await patch({ name: "Beauty" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "An industry with this name already exists." });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("answers 500 when the database fails", async () => {
    updated = { data: null, error: { message: "connection lost" } };

    expect((await patch({ name: "Pets" })).status).toBe(500);
  });
});
