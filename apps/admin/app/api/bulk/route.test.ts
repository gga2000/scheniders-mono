import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { AdminRole } from "@/types/admin";

/*
 * Bulk top-up used to call a non-existent `increment_wallet_balance` RPC, fall
 * back to a non-existent `wallets` table, insert type 'top_up' (the CHECK only
 * allows 'topup'), swallow every error and still answer { success: true }.
 * It must credit through admin_topup_wallet and report any failure.
 */

const state: { role: AdminRole } = { role: "super_admin" };
const ADMIN_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/api-auth", async () => {
  const { hasPermission } = await import("@/lib/admin-permissions");
  return {
    requireAdminPermission: async (_req: NextRequest, action: Parameters<typeof hasPermission>[1]) => {
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

const logAdminActivityBatch = vi.fn(async () => {});
vi.mock("@/lib/activity-logger", () => ({ logAdminActivityBatch }));

const { POST } = await import("./route");

const req = (body: unknown) =>
  new NextRequest("http://admin.test/api/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const topUp = (amount_iqd: unknown, tenant_ids = [T1, T2]) =>
  req({ action: "top_up", tenant_ids, params: { amount_iqd, description: "Promo credit" } });

beforeEach(() => {
  state.role = "super_admin";
  rpc.mockReset();
  from.mockReset();
  logAdminActivityBatch.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/bulk top_up", () => {
  it("credits every wallet through admin_topup_wallet and never touches tables directly", async () => {
    rpc.mockResolvedValue({ data: { success: true, new_balance: 15000 }, error: null });
    const res = await POST(topUp(10_000));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, affected: 2 });
    expect(rpc).toHaveBeenCalledTimes(2);
    for (const tid of [T1, T2]) {
      expect(rpc).toHaveBeenCalledWith("admin_topup_wallet", {
        _tenant_id: tid,
        _amount: 10_000,
        _description: "Promo credit",
        _created_by: ADMIN_ID,
        _payment_method: "manual",
      });
    }
    expect(rpc).not.toHaveBeenCalledWith("increment_wallet_balance", expect.anything());
    expect(from).not.toHaveBeenCalledWith("wallets");
    expect(from).not.toHaveBeenCalledWith("wallet_transactions");
  });

  it("reports failure instead of success when a wallet could not be credited", async () => {
    rpc
      .mockResolvedValueOnce({ data: { success: true, new_balance: 15000 }, error: null })
      .mockResolvedValueOnce({ data: { success: false, error: "No wallet found" }, error: null });
    const res = await POST(topUp(10_000));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.failed).toEqual([{ tenant_id: T2, error: "No wallet found" }]);
    expect(body.succeeded).toEqual([{ tenant_id: T1, new_balance: 15000 }]);
    // Only the credited tenant is audited as topped up.
    expect(logAdminActivityBatch).toHaveBeenCalledTimes(1);
    expect(logAdminActivityBatch).toHaveBeenCalledWith(
      expect.objectContaining({ tenantIds: [T1], action: "bulk_top_up", adminUserId: ADMIN_ID }),
    );
  });

  it("reports an RPC transport error as failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const res = await POST(topUp(10_000, [T1]));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it.each([999, 1500.5, 10_000_001, "10000"])("rejects amount_iqd %s", async (amount) => {
    const res = await POST(topUp(amount));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses support_staff", async () => {
    state.role = "support_staff";
    const res = await POST(topUp(10_000));
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
