import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/* The Merchants tabs carry their counts (board s2), counted with the list's own filters. */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/merchants/tabs"));

const shop = (n: number, status: string, plan = "starter", extra: Row = {}): Row => ({ id: `shop-${n}`, is_demo: false, status, plan, staff_locked: false, ...extra });

beforeEach(() => {
  stub = supabaseStub();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/merchants/tabs", () => {
  it("counts each tab as the list fills it, without the demo store", async () => {
    stub.state.tables.tenants = [
      shop(1, "trial"),
      shop(2, "trial", "starter", { staff_locked: true }),
      shop(3, "active"),
      shop(4, "active", "internal"),
      shop(5, "suspended"),
      shop(6, "cancelled"),
      shop(7, "active", "growth", { is_demo: true, staff_locked: true }),
    ];
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      counts: { all: 6, locked: 1, trial: 2, paying: 1, stopped: 1, cancelled: 1, internal: 1 },
    });
  });

  it("answers with an error when a count cannot be read, not with zeros", async () => {
    stub.state.failing.add("tenants");
    expect((await call()).status).toBe(500);
  });
});
