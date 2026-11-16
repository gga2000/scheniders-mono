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
const REQUEST = "cccccccc-1111-4222-8333-444444444444";

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

const topUp = (amount_iqd: unknown, tenant_ids = [T1, T2], request_id: unknown = REQUEST) =>
  req({ action: "top_up", tenant_ids, params: { amount_iqd, description: "Promo credit", request_id } });

const extendTrial = (days: unknown, tenant_ids: unknown[] = [T1, T2], reason: unknown = "Ramadan promo") =>
  req({ action: "extend_trial", tenant_ids, params: { days, reason } });

const extended = (tenantId: string) => ({
  data: { success: true, tenant_id: tenantId, trial_ends_at: "2026-12-01T00:00:00+00:00", subscriptions_moved: 1 },
  error: null,
});

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
        // One reference per request and shop: a retry of the same request
        // finds it in the ledger and credits nothing.
        _reference_id: `admin_topup:${REQUEST}:${tid}`,
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
    expect(body.succeeded).toEqual([{ tenant_id: T1, new_balance: 15000, duplicate: false }]);
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

  // null, not undefined: an undefined argument would fall back to the helper's default id.
  it.each([null, "", "not-a-uuid"])("refuses a top-up without a valid request id (%s)", async (requestId) => {
    const res = await POST(topUp(10_000, [T1, T2], requestId));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a retry after a partial failure audits only the wallet credited now", async () => {
    // T1 was credited by the first attempt of this request; T2 goes through now.
    rpc
      .mockResolvedValueOnce({ data: { success: true, new_balance: 15000, duplicate: true }, error: null })
      .mockResolvedValueOnce({ data: { success: true, new_balance: 10000 }, error: null });
    const res = await POST(topUp(10_000));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.succeeded).toEqual([
      { tenant_id: T1, new_balance: 15000, duplicate: true },
      { tenant_id: T2, new_balance: 10000, duplicate: false },
    ]);
    expect(logAdminActivityBatch).toHaveBeenCalledWith(
      expect.objectContaining({ tenantIds: [T2], action: "bulk_top_up" }),
    );
  });

  it("refuses support_staff", async () => {
    state.role = "support_staff";
    const res = await POST(topUp(10_000));
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a tenant id that is not a UUID", async () => {
    const res = await POST(req({ action: "top_up", tenant_ids: ["1 or 1=1"], params: { amount_iqd: 10_000, request_id: REQUEST } }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

/*
 * Bulk extend-trial used to write tenants.trial_ends_at itself: it skipped the
 * bill date, extended shops that were not on trial, swallowed every failure
 * and still answered { affected: <all> }. It must go through
 * admin_extend_trial per shop and report what really happened.
 */
describe("POST /api/bulk extend_trial", () => {
  it("extends every shop through admin_extend_trial with the acting admin, never a table write", async () => {
    rpc.mockResolvedValueOnce(extended(T1)).mockResolvedValueOnce(extended(T2));
    const res = await POST(extendTrial(14));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, affected: 2 });
    for (const tid of [T1, T2]) {
      expect(rpc).toHaveBeenCalledWith("admin_extend_trial", {
        _tenant_id: tid,
        _days: 14,
        _reason: "Ramadan promo",
        _admin_user_id: ADMIN_ID,
        _actor_email: "ops@example.com",
        _source: "bulk",
      });
    }
    expect(from).not.toHaveBeenCalled();
    // The RPC writes each shop's audit row; the route adds no second one.
    expect(logAdminActivityBatch).not.toHaveBeenCalled();
  });

  it("reports the shops that were refused instead of counting them as extended", async () => {
    rpc
      .mockResolvedValueOnce(extended(T1))
      .mockResolvedValueOnce({ data: { success: false, error: "not_trial" }, error: null });
    const res = await POST(extendTrial(7));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.succeeded).toEqual([{ tenant_id: T1, trial_ends_at: "2026-12-01T00:00:00+00:00" }]);
    expect(body.failed).toEqual([{ tenant_id: T2, error: "Tenant is not on a trial plan" }]);
  });

  it("reports a database error for one shop as a failure and still tries the rest", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "deadlock detected" } })
      .mockResolvedValueOnce(extended(T2));
    const res = await POST(extendTrial(7));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.failed).toEqual([{ tenant_id: T1, error: "Failed to extend trial" }]);
    expect(body.succeeded).toEqual([{ tenant_id: T2, trial_ends_at: "2026-12-01T00:00:00+00:00" }]);
  });

  it.each([0, 91, 7.5, "7", undefined])("rejects days %s", async (days) => {
    const res = await POST(extendTrial(days));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([null, "", "  ", "ok", 42, "x".repeat(501)])("rejects reason %s", async (reason) => {
    const res = await POST(extendTrial(7, [T1, T2], reason));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a bulk extension with no reason", async () => {
    const res = await POST(req({ action: "extend_trial", tenant_ids: [T1, T2], params: { days: 7 } }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends the reason trimmed", async () => {
    rpc.mockResolvedValueOnce(extended(T1));
    const res = await POST(extendTrial(7, [T1], "  courier strike  "));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_extend_trial", expect.objectContaining({ _reason: "courier strike" }));
  });
});

/*
 * Bulk "Send Notification" told staff it had sent a message to every picked
 * shop. It sent nothing: the route only wrote a log line. The action is gone,
 * so the route must refuse it and leave no "sent" line in the staff log.
 */
describe("POST /api/bulk send_notification", () => {
  it("is refused and writes nothing to the staff log", async () => {
    const res = await POST(
      req({ action: "send_notification", tenant_ids: [T1, T2], params: { message: "Your trial ends soon" } }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Invalid input" });
    expect(logAdminActivityBatch).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
