import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub } from "@/lib/supabase-stub.test-data";

/*
 * The Actions tab pages through one member of staff's steps in the staff log.
 * It read a table nothing writes, so every tab said "No actions recorded".
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const STAFF = "22222222-2222-4222-8222-222222222222";
const SHOP = "33333333-3333-4333-8333-333333333333";
const call = (query = "") =>
  GET(new NextRequest(`http://admin.test/api/team/${STAFF}/actions${query}`), { params: Promise.resolve({ id: STAFF }) });

beforeEach(() => {
  stub = supabaseStub();
  stub.state.tables.admin_activity_logs = [
    ...Array.from({ length: 60 }, (_, i) => ({
      id: `l${i}`, admin_user_id: STAFF, action: "top_up_wallet", tenant_id: SHOP,
      details: {}, created_at: "2026-11-16T10:00:00Z", tenant: [{ business_name: "Kawkab" }],
    })),
    { id: "m1", admin_user_id: STAFF, action: "mention_in_note", tenant_id: SHOP, details: {}, created_at: "2026-11-16T10:00:00Z", tenant: null },
    { id: "o1", admin_user_id: "someone-else", action: "top_up_wallet", tenant_id: SHOP, details: {}, created_at: "2026-11-16T10:00:00Z", tenant: null },
  ];
});

describe("GET /api/team/[id]/actions", () => {
  it("pages this person's own steps from the staff log", async () => {
    const res = await call("?page=2&limit=50");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(60);
    expect(body.actions).toHaveLength(10);
    expect(body.actions[0]).toEqual({
      id: "l50",
      action: "top_up_wallet",
      text: "Added money",
      shop: { id: SHOP, name: "Kawkab" },
      created_at: "2026-11-16T10:00:00Z",
    });
    expect(stub.tablesRead()).toEqual(["admin_activity_logs"]);
  });

  it("answers 500 when the log cannot be read", async () => {
    stub.state.failing.add("admin_activity_logs");

    const res = await call();

    expect(res.status).toBe(500);
  });
});
