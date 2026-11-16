import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { AdminRole } from "@/types/admin";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * A pause set status "limited" and forgot what the shop was. Lifting it then
 * had nothing to go by and wrote "active". The pause now goes through the
 * database (pause_tenant), which keeps the replaced status in
 * restrictions.status_before in the same statement.
 */

const state: { role: AdminRole } = { role: "super_admin" };
const SHOP = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/api-auth", async () => {
  const { hasPermission } = await import("@/lib/admin-permissions");
  return {
    requireAdminPermission: async (_req: NextRequest, action: Parameters<typeof hasPermission>[1]) => {
      if (!hasPermission(state.role, action)) {
        return NextResponse.json({ error: `Forbidden: missing permission "${action}"` }, { status: 403 });
      }
      return { user: { id: "admin-1", email: "ops@example.com" }, role: state.role };
    },
  };
});

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const logAdminActivity = vi.fn(async () => {});
vi.mock("@/lib/activity-logger", () => ({ logAdminActivity }));

const { POST } = await import("./route");
const call = (body: unknown = { reason: "late payments" }, id = SHOP) =>
  POST(
    new NextRequest(`http://admin.test/api/merchants/${id}/pause`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

/** The database's answer: the restrictions it was sent, plus the status it replaced. */
function pauseAs(statusBefore: string) {
  stub.state.functions.pause_tenant = (args: Row) => ({
    data: [
      {
        id: args._tenant_id,
        status: "limited",
        restrictions: { ...(args._restrictions as Row), status_before: statusBefore },
      },
    ],
    error: null,
  });
}

beforeEach(() => {
  state.role = "super_admin";
  stub = supabaseStub();
  pauseAs("trial");
  logAdminActivity.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/merchants/[id]/pause", () => {
  it("pauses through the database, which keeps the status the pause replaces", async () => {
    const res = await call({ reason: "late payments", duration_days: 3, blocks: { new_products: true } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(stub.state.rpcCalls).toHaveLength(1);
    const [{ fn, args }] = stub.state.rpcCalls;
    expect(fn).toBe("pause_tenant");
    expect(args._tenant_id).toBe(SHOP);
    expect(args._restrictions).toMatchObject({
      paused_by: "admin-1",
      reason: "late payments",
      blocks: { new_orders: true, new_products: true, team_invites: false, storefront_writes: false },
    });
    // The route does not say what the shop was: only the database knows, at the moment it writes.
    expect(args._restrictions).not.toHaveProperty("status_before");
    expect(stub.tablesRead()).toEqual([]);

    expect(body).toMatchObject({ id: SHOP, status: "limited", restrictions: { status_before: "trial" } });
    expect(logAdminActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: SHOP,
        action: "pause_tenant",
        details: expect.objectContaining({ restrictions: expect.objectContaining({ status_before: "trial" }) }),
      }),
    );
  });

  it("answers 404 for a shop that does not exist, and logs nothing", async () => {
    stub.state.functions.pause_tenant = () => ({ data: [], error: null });

    expect((await call()).status).toBe(404);
    expect(logAdminActivity).not.toHaveBeenCalled();
  });

  it("answers with an error when the database fails", async () => {
    stub.state.functions.pause_tenant = () => ({ data: null, error: { message: "connection lost" } });

    expect((await call()).status).toBe(500);
    expect(logAdminActivity).not.toHaveBeenCalled();
  });

  it("refuses a body it cannot read as a pause, before the database is asked", async () => {
    expect((await call({ duration_days: 0 })).status).toBe(400);
    expect(stub.state.rpcCalls).toEqual([]);
  });

  it("is for super admins only", async () => {
    state.role = "support_staff";

    expect((await call()).status).toBe(403);
    expect(stub.state.rpcCalls).toEqual([]);
  });
});
