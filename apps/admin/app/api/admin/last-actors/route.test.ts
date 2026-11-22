import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub } from "@/lib/supabase-stub.test-data";

/*
 * Audit R3-6: the badge route read the newest log rows of all the shops asked,
 * cut at five rows per shop. One busy shop pushed the other shops' last step
 * out of the cut, so they showed no badge. Each shop's step now comes from
 * admin_last_actors, one per shop.
 *
 * Round 23 data new 3: a step whose row kept the person's email but no staff
 * id read "system", while the shop's timeline named the email; and a failed
 * read of the staff names made every step read "system".
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { POST } = await import("./route");

const BUSY = "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d";
const QUIET = "0b9f1c2e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const NOOR = "1c0a5a0e-2b7d-4c55-9a51-3f0f0c8a7e11";
const SCRIPTED = "9e8d7c6b-5a49-4382-a716-f5e4d3c2b1a0";

const call = (tenant_ids: unknown) =>
  POST(new NextRequest("http://admin.test/api/admin/last-actors", { method: "POST", body: JSON.stringify({ tenant_ids }) }));

beforeEach(() => {
  stub = supabaseStub();
  stub.state.tables.user_profiles = [{ id: NOOR, display_name: "Noor", email: "noor@example.com", avatar_url: null }];
  stub.state.functions.admin_last_actors = () => ({
    data: {
      [BUSY]: { admin_user_id: NOOR, admin_label: "Noor", actor_email: null, action: "note", created_at: "2026-11-22T10:20:00+00:00" },
      [QUIET]: { admin_user_id: null, admin_label: "system", actor_email: null, action: "extend_trial", created_at: "2026-10-20T06:00:00+00:00" },
      [SCRIPTED]: { admin_user_id: null, admin_label: null, actor_email: "ali@example.com", action: "extend_trial", created_at: "2026-11-16T03:21:00+00:00" },
    },
    error: null,
  });
});

describe("the last-done-by badges", () => {
  it("asks for one step per shop, so a busy shop never hides a quiet one's", async () => {
    const res = await call([BUSY, QUIET]);
    expect(res.status).toBe(200);
    expect(stub.state.rpcCalls).toEqual([{ fn: "admin_last_actors", args: { p_tenant_ids: [BUSY, QUIET] } }]);
    expect(stub.tablesRead()).not.toContain("admin_activity_logs");
    const { actors } = await res.json();
    expect(actors[BUSY]).toEqual({
      display_name: "Noor", email: "noor@example.com", avatar_url: null, action: "note", when: "2026-11-22T10:20:00+00:00", is_system: false,
    });
    expect(actors[QUIET]).toMatchObject({ display_name: "system", action: "extend_trial", is_system: true });
  });

  it("names a step by the email its row kept, as the shop's timeline does, not \"system\"", async () => {
    const { actors } = await (await call([SCRIPTED])).json();
    expect(actors[SCRIPTED]).toEqual({
      display_name: "ali@example.com", email: "ali@example.com", avatar_url: null, action: "extend_trial", when: "2026-11-16T03:21:00+00:00", is_system: false,
    });
  });

  it("answers 500, not every step as \"system\", when the staff names cannot be read", async () => {
    stub.state.failing.add("user_profiles");
    expect((await call([BUSY, QUIET])).status).toBe(500);
  });

  it("answers 500, not empty badges, when the step read fails", async () => {
    stub.state.functions.admin_last_actors = () => ({ data: null, error: { message: "connection lost" } });
    expect((await call([BUSY])).status).toBe(500);
  });

  it("refuses a list it was not built for", async () => {
    expect((await call([])).status).toBe(400);
    expect((await call(["not-a-shop"])).status).toBe(400);
    expect(stub.state.rpcCalls).toEqual([]);
  });
});
