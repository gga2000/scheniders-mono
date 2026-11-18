import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/*
 * A note took an optional `mentions` list that no screen sends. Every entry
 * became a staff log row: an id became the row's staff member and any other
 * text its name, so a note could put rows in the log under anyone. A note is
 * now just its words, written under the person who wrote it.
 */

const ADMIN_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const SHOP_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: ADMIN_ID, email: "noor@example.com" }, role: "support_staff" }),
  requireAdminPermission: async () => ({ user: { id: ADMIN_ID, email: "noor@example.com" }, role: "support_staff" }),
}));

const inserts: Array<{ table: string; row: unknown }> = [];
vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        insert: (row: unknown) => {
          inserts.push({ table, row });
          return chain;
        },
        select: () => chain,
        eq: () => chain,
        single: () => Promise.resolve({ data: { id: table === "admin_notes" ? "n1" : SHOP_ID }, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return chain;
    },
  }),
}));

const { POST } = await import("./route");

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest(`http://admin.test/api/merchants/${SHOP_ID}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: SHOP_ID }) },
  );

beforeEach(() => {
  inserts.length = 0;
});

describe("POST /api/merchants/[id]/notes", () => {
  it("writes the note under its author and nothing in the staff log", async () => {
    const res = await post({
      content: "Called, will top up Sunday",
      mentions: ["bbbbbbbb-1111-4222-8333-444444444444", "system"],
    });

    expect(res.status).toBe(201);
    expect(inserts).toEqual([
      {
        table: "admin_notes",
        row: {
          tenant_id: SHOP_ID,
          admin_user_id: ADMIN_ID,
          admin_label: "noor@example.com",
          content: "Called, will top up Sunday",
          is_pinned: false,
        },
      },
    ]);
  });

  it("refuses an empty note", async () => {
    const res = await post({ content: "" });

    expect(res.status).toBe(400);
    expect(inserts).toEqual([]);
  });
});
