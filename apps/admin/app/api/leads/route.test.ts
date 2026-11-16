import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub } from "@/lib/supabase-stub.test-data";

/*
 * The leads search box: the text a person types is read as text. Before,
 * it went into the filter unquoted, so "Noor, Baghdad" split the filter and
 * the API answered 500.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = (params = "") => GET(new NextRequest(`http://admin.test/api/leads?${params}`));

beforeEach(() => {
  stub = supabaseStub();
  stub.state.tables.leads = [{ id: "lead-1", merchant_name: "Noor" }];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/leads search", () => {
  it("answers a search with a comma, reading the comma as text", async () => {
    const res = await call(`search=${encodeURIComponent("Noor, Baghdad")}`);

    expect(res.status).toBe(200);
    expect(stub.callsTo("leads.or")[0]?.[0]).toContain('merchant_name.ilike."%Noor, Baghdad%"');
  });

  it("looks in the name, page owner, handle, phone and city", async () => {
    await call("search=noor");

    expect(stub.callsTo("leads.or")[0]?.[0]).toBe(
      'merchant_name.ilike."%noor%",management_name.ilike."%noor%",handle.ilike."%noor%",page_phone.ilike."%noor%",city.ilike."%noor%"',
    );
  });

  it("keeps brackets and quotes as text", async () => {
    const res = await call(`search=${encodeURIComponent('a(b) "c"')}`);

    expect(res.status).toBe(200);
  });

  it("does not filter on a search of only spaces", async () => {
    await call("search=%20%20");

    expect(stub.callsTo("leads.or")).toHaveLength(0);
  });
});
