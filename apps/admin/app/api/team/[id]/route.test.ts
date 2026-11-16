import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub } from "@/lib/supabase-stub.test-data";

/*
 * A staff page reads that person's leads with an "or" filter built from the
 * id in the address. Only a user id gets that far, so the address cannot
 * change the filter.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = (id: string) =>
  GET(new NextRequest(`http://admin.test/api/team/${encodeURIComponent(id)}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  stub = supabaseStub();
});

describe("GET /api/team/[id]", () => {
  it("refuses an id that is not a user id, before any read", async () => {
    const res = await call("x,status.eq.lost");

    expect(res.status).toBe(404);
    expect(stub.tablesRead()).toEqual([]);
  });
});

describe("GET /api/team/[id] commissions", () => {
  const STAFF = "11111111-1111-4111-8111-111111111111";

  it("counts every commission as earned and the unpaid ones as waiting, as the Team page does", async () => {
    stub.state.tables.user_profiles = [{ id: STAFF, email: "omar@example.com", display_name: "Omar" }];
    stub.state.tables.admin_users = [{ user_id: STAFF, admin_role: "support_staff", is_active: true }];
    stub.state.tables.admin_employee_commissions = [
      { admin_user_id: STAFF, amount_earned: 25000, status: "paid" },
      { admin_user_id: STAFF, amount_earned: 15000, status: "paid" },
      { admin_user_id: STAFF, amount_earned: 8000, status: "pending" },
      // Approved is owed and not paid yet: it used to be counted nowhere.
      { admin_user_id: STAFF, amount_earned: 3000, status: "approved" },
    ];

    const res = await call(STAFF);

    expect(res.status).toBe(200);
    const { employee } = await res.json();
    expect(employee.commission_earned).toBe(51000);
    expect(employee.commission_pending).toBe(11000);
    // The page shows paid as earned minus waiting.
    expect(employee.commission_earned - employee.commission_pending).toBe(40000);
  });
});

describe("GET /api/team/[id] actions", () => {
  const STAFF = "22222222-2222-4222-8222-222222222222";
  const SHOP = "33333333-3333-4333-8333-333333333333";
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const yesterday = at(1);
  const twoDaysAgo = at(2);

  beforeEach(() => {
    stub.state.tables.user_profiles = [{ id: STAFF, email: "noor@example.com", display_name: "Noor" }];
    stub.state.tables.admin_users = [{ user_id: STAFF, admin_role: "support_staff", is_active: true }];
    stub.state.tables.admin_activity_logs = [
      {
        id: "l1", admin_user_id: STAFF, action: "extend_trial", tenant_id: SHOP,
        details: { days: 3 }, created_at: yesterday, tenant: { business_name: "Kawkab" },
      },
      { id: "l2", admin_user_id: STAFF, action: "export_data", tenant_id: null, details: { rows: 40 }, created_at: twoDaysAgo, tenant: null },
      // A note that names Noor is not a step Noor took.
      { id: "l3", admin_user_id: STAFF, action: "mention_in_note", tenant_id: SHOP, details: {}, created_at: at(1), tenant: null },
      { id: "l4", admin_user_id: "someone-else", action: "top_up_wallet", tenant_id: SHOP, details: {}, created_at: at(1), tenant: null },
    ];
    // The old table nothing writes.
    stub.state.tables.admin_employee_tracking = [{ admin_user_id: STAFF, action: "lead.call", created_at: at(1) }];
  });

  it("counts and lists the steps from the staff log, in plain words", async () => {
    const res = await call(STAFF);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.employee.total_actions).toBe(2);
    expect(body.recent_actions).toEqual([
      { id: "l1", action: "extend_trial", text: "Gave 3 free trial days", shop: { id: SHOP, name: "Kawkab" }, created_at: yesterday },
      { id: "l2", action: "export_data", text: "Downloaded a list", shop: null, created_at: twoDaysAgo },
    ]);
    expect(stub.tablesRead()).not.toContain("admin_employee_tracking");
  });

  it("gives the chart every step of its days, not the last 50", async () => {
    await call(STAFF);

    // One count of every step, and the chart's rows from 15 days back.
    const [from] = stub.callsTo("admin_activity_logs.gte").map(([column, value]) => ({ column, value }));
    expect(from?.column).toBe("created_at");
    const days = (Date.now() - Date.parse(String(from?.value))) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(15);
    expect(stub.callsTo("admin_activity_logs.limit")).toEqual([]);
  });
});
