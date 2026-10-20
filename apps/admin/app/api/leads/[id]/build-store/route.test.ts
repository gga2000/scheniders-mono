import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * build-store is the second path that creates a tenant for a lead. One tenant
 * per lead is enforced by tenants_prospect_lead_id_key; these tests pin the
 * route's side: it refuses a converted lead before inserting anything, and a
 * lost race (unique violation) is a 409, not a 500 or a second tenant.
 */

const LEAD = "44444444-4444-4444-8444-444444444444";
const TENANT = "33333333-3333-4333-8333-333333333333";

type DbError = { code: string; message: string } | null;
type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> };

let leadRow: Record<string, unknown> | null;
let tenantInsertError: DbError;
const calls: Call[] = [];

function builder(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  calls.push(call);
  const result = (): { data: unknown; error: DbError } => {
    if (table === "leads" && call.op === "select") {
      return leadRow ? { data: leadRow, error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
    }
    if (table === "tenants" && call.op === "insert") {
      return tenantInsertError
        ? { data: null, error: tenantInsertError }
        : { data: { id: TENANT, slug: "shop-abc" }, error: null };
    }
    return { data: null, error: null };
  };
  const chain = {
    select: () => chain,
    insert: (payload: unknown) => {
      call.op = "insert";
      call.payload = payload;
      return chain;
    },
    update: (payload: unknown) => {
      call.op = "update";
      call.payload = payload;
      return chain;
    },
    eq: (col: string, val: unknown) => {
      call.filters.push(["eq", col, val]);
      return chain;
    },
    is: (col: string, val: unknown) => {
      call.filters.push(["is", col, val]);
      return chain;
    },
    single: async () => result(),
    then: (resolve: (v: { data: unknown; error: DbError }) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return chain;
}

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
  requireAdmin: vi.fn(async (token: string) =>
    token === "admin" ? { user: { id: "11111111-1111-4111-8111-111111111111" }, role: "super_admin" } : null,
  ),
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  calls.length = 0;
  tenantInsertError = null;
  leadRow = {
    id: LEAD,
    merchant_name: "Shop",
    status: "contacted",
    prospect_tenant_id: null,
    converted_tenant_id: null,
    phone_numbers: [],
  };
});

function buildStore(): Promise<Response> {
  return import("./route").then(({ POST }) =>
    POST(
      new NextRequest(`http://admin.test/api/leads/${LEAD}/build-store`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer admin" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: LEAD }) },
    ),
  );
}

const tenantInserts = () => calls.filter((c) => c.table === "tenants" && c.op === "insert");

describe("POST /api/leads/[id]/build-store", () => {
  it("refuses a converted lead with 409 and inserts no tenant", async () => {
    leadRow = { ...leadRow, status: "converted", converted_tenant_id: TENANT };
    const res = await buildStore();
    expect(res.status).toBe(409);
    expect(tenantInserts()).toHaveLength(0);
  });

  it("refuses a lead whose status says converted even without a tenant id", async () => {
    leadRow = { ...leadRow, status: "converted" };
    const res = await buildStore();
    expect(res.status).toBe(409);
    expect(tenantInserts()).toHaveLength(0);
  });

  it("maps a lost one-tenant-per-lead race to 409 and writes nothing after it", async () => {
    tenantInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "tenants_prospect_lead_id_key"',
    };
    const res = await buildStore();
    expect(res.status).toBe(409);
    expect(calls.filter((c) => c.op !== "select" && c.table !== "tenants")).toHaveLength(0);
  });

  it("still returns 500 for any other tenant insert failure", async () => {
    tenantInsertError = { code: "23505", message: 'duplicate key value violates unique constraint "tenants_slug_key"' };
    const res = await buildStore();
    expect(res.status).toBe(500);
  });

  it("builds the store and links it only to a lead that is still unconverted", async () => {
    const res = await buildStore();
    expect(res.status).toBe(201);
    expect(tenantInserts()[0]?.payload).toMatchObject({ prospect_lead_id: LEAD, is_prospect: true });
    const leadUpdate = calls.find((c) => c.table === "leads" && c.op === "update");
    expect(leadUpdate?.filters).toEqual([
      ["eq", "id", LEAD],
      ["is", "converted_tenant_id", null],
    ]);
  });
});
