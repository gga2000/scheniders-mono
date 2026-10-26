import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { AdminRole } from "@/types/admin";

/*
 * NEW-P1-30: the admin top-up was middleware-only (any admin role could credit
 * money), read the balance in JS and wrote balance + amount back (two
 * concurrent top-ups lost one), and recorded no actor. The route must now
 * require the top_up_wallet permission, credit only through the atomic
 * admin_topup_wallet RPC, and audit the admin who did it.
 */

const state: { role: AdminRole | null } = { role: "super_admin" };
const ADMIN_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const TENANT = "bbbbbbbb-1111-4222-8333-444444444444";

vi.mock("@/lib/api-auth", async () => {
  const { hasPermission } = await import("@/lib/admin-permissions");
  return {
    requireAdminPermission: async (_req: NextRequest, action: Parameters<typeof hasPermission>[1]) => {
      if (!state.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!hasPermission(state.role, action)) {
        return NextResponse.json({ error: `Forbidden: missing permission "${action}"` }, { status: 403 });
      }
      return { user: { id: ADMIN_ID, email: "ops@example.com" }, role: state.role };
    },
  };
});

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from }) }));

const logAdminActivity = vi.fn(async () => {});
vi.mock("@/lib/activity-logger", () => ({ logAdminActivity }));

const { POST } = await import("./route");

const req = (body: unknown) =>
  new NextRequest("http://admin.test/api/billing/topup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  state.role = "super_admin";
  rpc.mockReset();
  from.mockReset();
  logAdminActivity.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/billing/topup", () => {
  it("refuses support_staff (no top_up_wallet permission) before touching the wallet", async () => {
    state.role = "support_staff";
    const res = await POST(req({ tenant_id: TENANT, amount: 5000 }));
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("credits through the atomic RPC with the acting admin, never a read-then-write", async () => {
    rpc.mockResolvedValue({ data: { success: true, new_balance: 30000 }, error: null });
    const res = await POST(req({ tenant_id: TENANT, amount: 5000, description: "Zain cash receipt 12" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, newBalance: 30000 });
    expect(rpc).toHaveBeenCalledWith("admin_topup_wallet", {
      _tenant_id: TENANT,
      _amount: 5000,
      _description: "Zain cash receipt 12",
      _created_by: ADMIN_ID,
      _payment_method: "manual",
    });
    // No direct table access: the balance is never read or written from JS.
    expect(from).not.toHaveBeenCalled();
  });

  it("writes an admin audit row naming the admin and the amount", async () => {
    rpc.mockResolvedValue({ data: { success: true, new_balance: 30000 }, error: null });
    await POST(req({ tenant_id: TENANT, amount: 5000 }));
    expect(logAdminActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        tenantId: TENANT,
        action: "top_up_wallet",
        details: expect.objectContaining({ amount_iqd: 5000, new_balance_iqd: 30000 }),
      }),
    );
  });

  it("reports failure (and logs nothing) when the RPC refuses", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "No wallet found" }, error: null });
    const res = await POST(req({ tenant_id: TENANT, amount: 5000 }));
    expect(res.status).toBe(404);
    expect(logAdminActivity).not.toHaveBeenCalled();

    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res2 = await POST(req({ tenant_id: TENANT, amount: 5000 }));
    expect(res2.status).toBe(500);
    expect(logAdminActivity).not.toHaveBeenCalled();
  });

  it.each([0, -5000, 1500.5, 10_000_001])("rejects amount %s", async (amount) => {
    const res = await POST(req({ tenant_id: TENANT, amount }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
