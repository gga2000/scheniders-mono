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

const { GET, POST } = await import("./route");
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

/*
 * The sort menu's value went to the database as it came, and nothing broke
 * ties: 15 of 28 leads share a score, so with 20 a page the second page could
 * show a lead again and skip another. The API now orders only by the menu's
 * sorts, then by id.
 */
describe("GET /api/leads sort", () => {
  it("orders by the menu's sort, then by id so pages never overlap", async () => {
    const res = await call("sort=lead_score:desc");

    expect(res.status).toBe(200);
    expect(stub.callsTo("leads.order")).toEqual([
      ["lead_score", { ascending: false, nullsFirst: false }],
      ["id", { ascending: true, nullsFirst: false }],
    ]);
  });

  it("shows the newest first when no sort is given", async () => {
    await call();

    expect(stub.callsTo("leads.order")[0]).toEqual(["created_at", { ascending: false, nullsFirst: false }]);
  });

  it.each(["password:asc", "lead_score:asc", "lead_score:desc,id:asc", "industry(name):desc"])(
    "refuses %j, before any read",
    async (sort) => {
      const res = await call(`sort=${encodeURIComponent(sort)}`);

      expect(res.status).toBe(400);
      expect(stub.tablesRead()).toEqual([]);
    },
  );
});

describe("POST /api/leads owner", () => {
  /*
   * A new lead took any assigned_to from the body: a lead could be created
   * already owned by a login that is not staff, with no history line and no
   * reassign_lead row. An owner is now given only through admin_change_leads.
   */
  it("creates a lead with no owner, whatever the body says", async () => {
    const inserts: Record<string, unknown>[] = [];
    const builder = {
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        return builder;
      },
      select: () => builder,
      single: async () => ({ data: { id: "lead-2", merchant_name: "Kawkab" }, error: null }),
    };
    stub.client.from = () => builder as unknown as ReturnType<typeof stub.client.from>;
    const res = await POST(
      new NextRequest("http://admin.test/api/leads", {
        method: "POST",
        body: JSON.stringify({ merchant_name: "Kawkab", assigned_to: "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).not.toHaveProperty("assigned_to");
    expect(inserts[0]).not.toHaveProperty("assigned_at");
    expect(inserts[0].created_by).toBe("a");
  });
});

describe("POST /api/leads industry", () => {
  // A colleague removed the picked industry while the form was open: the answer says so.
  it("says the industry was just removed instead of failing", async () => {
    const builder = {
      insert: () => builder,
      select: () => builder,
      single: async () => ({
        data: null,
        error: { code: "23503", message: 'insert or update on table "leads" violates foreign key constraint "leads_industry_id_fkey"' },
      }),
    };
    stub.client.from = () => builder as unknown as ReturnType<typeof stub.client.from>;
    const res = await POST(
      new NextRequest("http://admin.test/api/leads", {
        method: "POST",
        body: JSON.stringify({ merchant_name: "Kawkab", industry_id: "2f3e4d5c-6b7a-4980-a1b2-c3d4e5f6a7b8" }),
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This industry was just removed. Pick another one and save again.");
  });
});
