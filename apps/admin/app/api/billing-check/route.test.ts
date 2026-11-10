import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const SHOP = "33333333-3333-4333-8333-333333333333";
let tables: Record<string, unknown[]>;
const filters: Record<string, string[]> = {};

function query(table: string) {
  const record = (f: string) => {
    (filters[table] ??= []).push(f);
    return q;
  };
  const q = {
    select: () => q,
    eq: (c: string, v: string) => record(`eq ${c} ${v}`),
    neq: (c: string, v: string) => record(`neq ${c} ${v}`),
    lt: (c: string) => record(`lt ${c}`),
    in: () => q,
    limit: () => q,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: tables[table] ?? [], error: null }),
  };
  return q;
}

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ from: (t: string) => query(t) }) }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: vi.fn(async () => ({ user: { id: "a" }, role: "super_admin" })),
}));

const { GET } = await import("./route");

async function check() {
  return (await GET(new NextRequest("http://localhost/api/billing-check"))).json();
}

beforeEach(() => {
  tables = {};
  for (const k of Object.keys(filters)) delete filters[k];
});

describe("GET /api/billing-check", () => {
  it("nothing missed: both lists empty", async () => {
    expect(await check()).toEqual({ trialsNotPaused: [], renewalsMissed: [] });
  });

  it("names a trial that ended and a month that was not renewed, never Ali's own store", async () => {
    tables = {
      tenants: [{ id: SHOP, business_name: "Shop A", trial_ends_at: "2026-11-01T00:00:00Z" }],
      subscriptions: [{ tenant_id: SHOP, current_period_end: "2026-11-01T00:00:00Z" }],
    };
    const body = await check();
    expect(body.trialsNotPaused[0]).toEqual({ tenant_id: SHOP, business_name: "Shop A", due: "2026-11-01T00:00:00Z" });
    expect(body.renewalsMissed[0].business_name).toBe("Shop A");
    expect(filters.tenants).toContain("neq plan internal");
    expect(filters.tenants).toContain("eq status trial");
    expect(filters.subscriptions).toContain("eq status active");
  });
});
