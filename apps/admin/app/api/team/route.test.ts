import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * The Team page read every lead, every logged action and every commission and
 * counted them here. The API returns at most 1,000 rows, so a busy member of
 * staff showed too few, and a failed read showed 0. The counts now come from
 * one database function.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/team"));

const counts = (userId: string, extra: Row = {}): Row => ({
  user_id: userId,
  leads_added: 0,
  leads_converted: 0,
  stores_built: 0,
  total_actions: 0,
  commission_earned: 0,
  commission_pending: 0,
  ...extra,
});

beforeEach(() => {
  stub = supabaseStub();
  stub.state.tables.admin_users = [
    { user_id: "sara", admin_role: "support_staff", is_active: true, display_name: "Sara", email: "sara@team.test" },
    { user_id: "omar", admin_role: "super_admin", is_active: true, display_name: null, email: "omar@team.test" },
  ];
  stub.state.tables.user_profiles = [
    { id: "sara", email: "sara@team.test", display_name: "Sara H.", avatar_url: null, last_login_at: "2026-11-16T05:00:00Z" },
  ];
  stub.state.tables.admin_employee_achievements = [{ admin_user_id: "sara", achievement_key: "first_lead" }];
  stub.state.functions.admin_team_counts = () => ({
    data: [
      counts("sara", { leads_added: 3, leads_converted: 1, stores_built: 2, total_actions: 1500 }),
      counts("omar", { leads_added: 1, leads_converted: 1, stores_built: 1, commission_earned: 40000, commission_pending: 8000 }),
    ],
    error: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/team", () => {
  it("takes the counts from the database, not from rows counted here", async () => {
    const { employees } = await (await call()).json();

    expect(stub.state.rpcCalls).toEqual([{ fn: "admin_team_counts", args: {} }]);
    expect(stub.tablesRead()).toEqual(["admin_users", "user_profiles", "admin_employee_achievements"]);
    expect(employees).toEqual([
      {
        id: "sara",
        email: "sara@team.test",
        display_name: "Sara H.",
        avatar_url: null,
        role: "support_staff",
        is_active: true,
        last_login_at: "2026-11-16T05:00:00Z",
        leads_added: 3,
        leads_converted: 1,
        stores_built: 2,
        total_actions: 1500,
        commission_earned: 0,
        commission_pending: 0,
        achievements: ["first_lead"],
      },
      {
        id: "omar",
        email: "omar@team.test",
        display_name: "omar@team.test",
        avatar_url: null,
        role: "super_admin",
        is_active: true,
        last_login_at: null,
        leads_added: 1,
        leads_converted: 1,
        stores_built: 1,
        total_actions: 0,
        commission_earned: 40000,
        commission_pending: 8000,
        achievements: [],
      },
    ]);
  });

  it("answers with an error when the counts cannot be read, not with zeros", async () => {
    stub.state.functions.admin_team_counts = () => ({ data: null, error: { message: "statement timeout" } });

    const response = await call();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to fetch team" });
  });

  it("answers with an error when a member of staff has no counts", async () => {
    stub.state.functions.admin_team_counts = () => ({ data: [counts("sara")], error: null });

    expect((await call()).status).toBe(500);
  });

  it.each(["user_profiles", "admin_employee_achievements"])(
    "answers with an error when %s cannot be read",
    async (table) => {
      stub.state.failing.add(table);

      expect((await call()).status).toBe(500);
    },
  );

  it("answers with an empty team, and asks nothing more, when there is no staff", async () => {
    stub.state.tables.admin_users = [];

    expect(await (await call()).json()).toEqual({ employees: [] });
    expect(stub.state.rpcCalls).toEqual([]);
  });
});
