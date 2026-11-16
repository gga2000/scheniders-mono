import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { AdminRole } from "@/types/admin";
import { supabaseStub } from "@/lib/supabase-stub.test-data";

/*
 * "Resume now" on a paused shop wrote status "active", whatever the shop was
 * before the pause. A shop on trial came back as a paying shop with its
 * subscription still "trialing": the billing lock holds a trial at its end date
 * and a paying shop whose month is unpaid, so that shop was never locked and
 * never asked to pay. The same call made any shop "active" that was not paused
 * at all. The status now comes from the database (lift_tenant_pause), which
 * gives back what the pause replaced and touches no shop that is not paused.
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
const call = (id = SHOP) =>
  POST(new NextRequest(`http://admin.test/api/merchants/${id}/unpause`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  state.role = "super_admin";
  stub = supabaseStub();
  stub.state.tables.tenants = [{ id: SHOP, status: "limited" }];
  logAdminActivity.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/merchants/[id]/unpause", () => {
  it("gives the shop the status the database hands back, and writes no status itself", async () => {
    stub.state.functions.lift_tenant_pause = () => ({
      data: [{ id: SHOP, status: "trial", restrictions: {} }],
      error: null,
    });

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: SHOP, status: "trial", restrictions: {} });
    expect(stub.state.rpcCalls).toEqual([{ fn: "lift_tenant_pause", args: { _tenant_id: SHOP } }]);
    // No write from here: the old route updated tenants with status "active".
    expect(stub.tablesRead()).toEqual([]);
    expect(logAdminActivity).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: SHOP, action: "unpause_tenant", details: { status: "trial" } }),
    );
  });

  it("refuses a shop that is not paused, and logs nothing", async () => {
    stub.state.tables.tenants = [{ id: SHOP, status: "suspended" }];
    stub.state.functions.lift_tenant_pause = () => ({ data: [], error: null });

    const res = await call();

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This shop is not paused" });
    expect(logAdminActivity).not.toHaveBeenCalled();
  });

  it("answers 404 for a shop that does not exist", async () => {
    stub.state.tables.tenants = [];
    stub.state.functions.lift_tenant_pause = () => ({ data: [], error: null });

    expect((await call()).status).toBe(404);
    expect(logAdminActivity).not.toHaveBeenCalled();
  });

  it("answers with an error when the database fails or answers with something else", async () => {
    stub.state.functions.lift_tenant_pause = () => ({ data: null, error: { message: "connection lost" } });
    expect((await call()).status).toBe(500);

    stub.state.functions.lift_tenant_pause = () => ({ data: [{ id: SHOP }], error: null });
    expect((await call()).status).toBe(500);

    expect(logAdminActivity).not.toHaveBeenCalled();
  });

  it("is for super admins only", async () => {
    state.role = "support_staff";

    expect((await call()).status).toBe(403);
    expect(stub.state.rpcCalls).toEqual([]);
  });
});
