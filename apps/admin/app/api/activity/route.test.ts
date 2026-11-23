import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub } from "@/lib/supabase-stub.test-data";

/*
 * The Activity page. Its filter sent action names the console never writes,
 * so a filtered page was always empty; it now sends a kind of step. Rows
 * written in the same instant could repeat or vanish between pages, and the
 * Shop column showed ids because no shop name was read.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = (params = "") => GET(new NextRequest(`http://admin.test/api/activity?${params}`));

beforeEach(() => {
  stub = supabaseStub();
  stub.state.tables.admin_activity_logs = [
    { id: "l1", action: "status_change", created_at: "2026-11-16T10:00:00Z", tenant_id: "s1", tenant: { business_name: "Kawkab" } },
    { id: "l2", action: "export_data", created_at: "2026-11-16T09:00:00Z", tenant_id: null, tenant: null },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/activity", () => {
  it("filters by a kind of step, as one database filter", async () => {
    const res = await call("kind=support");

    expect(res.status).toBe(200);
    expect(stub.callsTo("admin_activity_logs.or")).toEqual([["action.like.support_*"]]);
  });

  it("refuses a kind it does not know, and reads nothing", async () => {
    const res = await call("kind=login");

    expect(res.status).toBe(400);
    expect(stub.tablesRead()).toEqual([]);
  });

  it("refuses a shop id that is not an id, and reads nothing", async () => {
    const res = await call("tenant_id=abc");

    expect(res.status).toBe(400);
    expect(stub.tablesRead()).toEqual([]);
  });

  it("orders by time, then by id, so a page boundary never skips or repeats a step", async () => {
    await call();

    expect(stub.callsTo("admin_activity_logs.order")).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
  });

  it("names the shop of each step", async () => {
    const { logs } = await (await call()).json();

    expect(logs.map((log: { id: string; business_name: string | null }) => [log.id, log.business_name])).toEqual([
      ["l1", "Kawkab"],
      ["l2", null],
    ]);
    expect(logs[0]).not.toHaveProperty("tenant");
  });

  it("counts the whole log for the Activity page, which pages by the total", async () => {
    await call("limit=50");
    expect(stub.callsTo("admin_activity_logs.select")[0][1]).toEqual({ count: "exact" });
  });

  it("does not count the log for the bell, which asks every minute and shows no total", async () => {
    const res = await call("limit=20&count=none");
    expect(stub.callsTo("admin_activity_logs.select")[0][1]).toBeUndefined();
    const body = await res.json();
    expect(body.total).toBeNull();
    expect(body.logs).toHaveLength(2);
  });
  /*
   * Round 25 data new 2: Activity named a staff step by its email (or
   * "system"), while the Merchants badge and the shop's timeline named the
   * same row by the person's name (or "Automatic").
   */
  it("names each step as the Merchants badge and the shop's timeline do", async () => {
    stub.state.tables.admin_activity_logs = [
      { id: "l1", action: "support_reached_out", created_at: "2026-11-16T10:00:00Z", tenant_id: "s1", admin_user_id: "u-ali", admin_label: null, actor_email: "ali@x.co", tenant: null },
      { id: "l2", action: "status_change", created_at: "2026-11-16T09:00:00Z", tenant_id: "s1", admin_user_id: null, admin_label: "system", actor_email: null, tenant: null },
      { id: "l3", action: "status_change", created_at: "2026-11-16T08:00:00Z", tenant_id: "s1", admin_user_id: "u-noor", admin_label: null, actor_email: "noor@x.co", tenant: null },
    ];
    stub.state.tables.user_profiles = [
      { id: "u-ali", display_name: " Ali ", email: "ali@x.co", avatar_url: null },
      { id: "u-noor", display_name: null, email: "noor@x.co", avatar_url: null },
    ];

    const { logs } = await (await call()).json();

    expect(logs.map((log: { actor: string }) => log.actor)).toEqual(["Ali", "Automatic", "noor@x.co"]);
    expect(stub.callsTo("user_profiles.in")).toEqual([["id", ["u-ali", "u-noor"]]]);
  });

  it("fails the page when the names cannot be read, rather than name every step by email", async () => {
    stub.state.tables.admin_activity_logs = [
      { id: "l1", action: "support_reached_out", created_at: "2026-11-16T10:00:00Z", tenant_id: "s1", admin_user_id: "u-ali", admin_label: null, actor_email: "ali@x.co", tenant: null },
    ];
    stub.state.failing.add("user_profiles");

    expect((await call()).status).toBe(500);
  });

  it("reads no names for a page with no staff steps", async () => {
    await call();
    expect(stub.tablesRead()).not.toContain("user_profiles");
  });
});
