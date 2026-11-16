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
