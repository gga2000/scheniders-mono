import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/*
 * Tags were written to tenants.tags, a column that never existed, so every
 * save failed. They now go to staff_shop_tags: one row per shop, which only
 * the console's server can read, because a merchant reads their own tenants row.
 */

const SHOP = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: async () => ({ user: { id: "admin-1", email: "ops@example.com" }, role: "support_staff" }),
}));

type Answer = { data: { tags: string[] } | null; error: { code?: string; message: string } | null };
const db = {
  answer: { data: null, error: null } as Answer,
  writes: [] as Array<{ table: string; row: unknown; options: unknown }>,
};
vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: (row: unknown, options: unknown) => {
        db.writes.push({ table, row, options });
        return { select: () => ({ single: async () => db.answer }) };
      },
    }),
  }),
}));

const logAdminAction = vi.fn(async () => {});
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));

const { PUT } = await import("./route");
const call = (body: unknown, id = SHOP) =>
  PUT(
    new NextRequest(`http://admin.test/api/merchants/${id}/tags`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  db.answer = { data: { tags: ["VIP", "At Risk"] }, error: null };
  db.writes = [];
  logAdminAction.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PUT /api/merchants/[id]/tags", () => {
  it("saves the shop's tags in staff_shop_tags, not on the tenants row", async () => {
    const response = await call({ tags: ["VIP", " At Risk ", "VIP"] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tags: ["VIP", "At Risk"] });
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toMatchObject({
      table: "staff_shop_tags",
      // Trimmed, and the same tag twice is kept once.
      row: { tenant_id: SHOP, tags: ["VIP", "At Risk"] },
      options: { onConflict: "tenant_id" },
    });
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), "update_tags", {
      tenantId: SHOP,
      details: { tags: ["VIP", "At Risk"] },
    });
  });

  it("clears the tags when the list is empty", async () => {
    db.answer = { data: { tags: [] }, error: null };

    const response = await call({ tags: [] });

    expect(response.status).toBe(200);
    expect(db.writes[0]).toMatchObject({ row: { tenant_id: SHOP, tags: [] } });
  });

  it("answers 404 for a shop that does not exist, and logs nothing", async () => {
    db.answer = { data: null, error: { code: "23503", message: "violates foreign key constraint" } };

    const response = await call({ tags: ["VIP"] });

    expect(response.status).toBe(404);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it.each([
    ["more than 20 tags", { tags: Array.from({ length: 21 }, (_, n) => `tag ${n}`) }],
    ["a blank tag", { tags: ["  "] }],
    ["a tag over 50 letters", { tags: ["x".repeat(51)] }],
    ["no list", {}],
  ])("refuses %s and writes nothing", async (_case, body) => {
    expect((await call(body)).status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  it("answers 404 for an id that is not a shop id, and writes nothing", async () => {
    expect((await call({ tags: ["VIP"] }, "not-an-id")).status).toBe(404);
    expect(db.writes).toEqual([]);
  });

  it("answers 500 when the save fails, and logs nothing", async () => {
    db.answer = { data: null, error: { message: "connection lost" } };

    expect((await call({ tags: ["VIP"] })).status).toBe(500);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
