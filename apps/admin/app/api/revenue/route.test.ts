import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/*
 * /api/revenue embedded `wallets` (the table is `wallet`), so the tenants query
 * errored, the error was never read, and every tenant name/plan came back
 * "Unknown". Wallet charges are stored as NEGATIVE amounts, so revenue summed to
 * a negative number.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

const now = new Date();
const thisMonth = new Date(now.getFullYear(), now.getMonth(), 2, 12).toISOString();
const result: Record<string, { data: unknown; error: { message: string } | null }> = {};
const tenantSelects: string[] = [];

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: (cols: string) => {
          if (table === "tenants") tenantSelects.push(cols);
          return chain;
        },
        in: () => chain,
        gte: () => chain,
        order: () => chain,
        then: (resolve: (v: unknown) => unknown) => resolve(result[table]),
      };
      return chain;
    },
  }),
}));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/revenue"));

beforeEach(() => {
  tenantSelects.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  result.wallet_transactions = {
    data: [
      { id: "1", tenant_id: "t1", type: "charge", amount_iqd: -1000, created_at: thisMonth },
      { id: "2", tenant_id: "t1", type: "charge", amount_iqd: -500, created_at: thisMonth },
      { id: "3", tenant_id: "t1", type: "topup", amount_iqd: 50000, created_at: thisMonth },
    ],
    error: null,
  };
  result.tenants = { data: [{ id: "t1", business_name: "Shop", plan: "growth", status: "active", created_at: thisMonth }], error: null };
  result.subscriptions = { data: [], error: null };
});

describe("GET /api/revenue", () => {
  it("does not embed a non-existent `wallets` relation", async () => {
    await GET(new NextRequest("http://admin.test/api/revenue"));
    expect(tenantSelects.join(",")).not.toContain("wallets");
  });

  it("counts charges (stored negative) as positive revenue", async () => {
    const body = await (await call()).json();
    expect(body.mrrWaterfall[5].revenue).toBe(1500);
    expect(body.topLTV[0]).toMatchObject({ name: "Shop", revenue: 1500 });
    expect(body.revenueByPlan).toEqual([{ plan: "growth", data: [0, 0, 0, 0, 0, 1500] }]);
  });

  it("returns 500 when a query fails instead of silently showing empty data", async () => {
    result.tenants = { data: null, error: { message: "relation does not exist" } };
    const res = await call();
    expect(res.status).toBe(500);
  });
});
