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
const REQUEST = "cccccccc-1111-4222-8333-444444444444";

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
// The per-staff limit has its own test (lib/staff-rate-limit.test.ts).
const staffRateLimit = vi.fn(async (): Promise<Response | null> => null);
vi.mock("@/lib/staff-rate-limit", () => ({ staffRateLimit }));
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from }) }));

const logAdminActivity = vi.fn(async () => {});
vi.mock("@/lib/activity-logger", () => ({ logAdminActivity }));

const { POST } = await import("./route");

/** Every request carries the browser-made request id and a reason unless a test removes them. */
const req = (body: Record<string, unknown>) =>
  new NextRequest("http://admin.test/api/billing/topup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request_id: REQUEST, description: "Qi transfer, receipt 12", ...body }),
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

  // Round 25 (security item 18): a top-up past the staff login's limit is refused before any money moves.
  it("refuses past the staff login's limit before touching the wallet", async () => {
    staffRateLimit.mockResolvedValueOnce(Response.json({ error: "Too many of these in a short time." }, { status: 429 }));
    const res = await POST(req({ tenant_id: TENANT, amount: 5000 }));
    expect(res.status).toBe(429);
    expect(staffRateLimit).toHaveBeenCalledWith(ADMIN_ID, "top-up");
    expect(rpc).not.toHaveBeenCalled();
  });

  // Ali's money rule, 23 Nov: staff add at least 2,500 IQD by hand.
  it("refuses less than 2,500 IQD in the console's words, before touching the wallet", async () => {
    for (const amount of [1, 2_499]) {
      const res = await POST(req({ tenant_id: TENANT, amount }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("At least 2,500 IQD at once.");
    }
    rpc.mockResolvedValue({ data: { success: true, new_balance: 2_500 }, error: null });
    expect((await POST(req({ tenant_id: TENANT, amount: 2_500 }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("credits through the atomic RPC with the acting admin, never a read-then-write", async () => {
    rpc.mockResolvedValue({ data: { success: true, new_balance: 30000 }, error: null });
    const res = await POST(req({ tenant_id: TENANT, amount: 5000, description: "Zain cash receipt 12" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, newBalance: 30000, duplicate: false });
    expect(rpc).toHaveBeenCalledWith("admin_topup_wallet", {
      _tenant_id: TENANT,
      _amount: 5000,
      _description: "Zain cash receipt 12",
      _created_by: ADMIN_ID,
      _payment_method: "manual",
      _reference_id: `admin_topup:${REQUEST}:${TENANT}`,
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

  it("tells staff what happened in plain words, never the database's own", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "No wallet found" }, error: null });
    expect(await (await POST(req({ tenant_id: TENANT, amount: 5000 }))).json()).toEqual({
      error: "This shop has no wallet yet, so nothing was added.",
    });

    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for table "wallet"' } });
    const body = await (await POST(req({ tenant_id: TENANT, amount: 5000 }))).json();
    expect(body).toEqual({ error: "The top-up could not be confirmed. Check the wallet before trying again: a retry from this browser within the hour adds it once at most." });
    expect(JSON.stringify(body)).not.toMatch(/permission|wallet"/);
  });

  it.each([undefined, "", "not-a-uuid", 42])(
    "refuses a top-up without a valid request id (%s): a retry could not be told apart",
    async (request_id) => {
      const res = await POST(req({ tenant_id: TENANT, amount: 5000, request_id }));
      expect(res.status).toBe(400);
      // A tab from before request ids is told to reload, as on every other money form.
      expect((await res.json()).error).toBe("This page is out of date. Reload it and try again");
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("sends the same ledger reference when the same request is retried", async () => {
    rpc.mockResolvedValue({ data: { success: true, new_balance: 30000 }, error: null });
    await POST(req({ tenant_id: TENANT, amount: 5000 }));
    await POST(req({ tenant_id: TENANT, amount: 5000 }));
    const references = rpc.mock.calls.map(([, args]) => (args as { _reference_id: string })._reference_id);
    expect(references).toEqual([
      `admin_topup:${REQUEST}:${TENANT}`,
      `admin_topup:${REQUEST}:${TENANT}`,
    ]);
  });

  it("reports a repeat the database already credited as duplicate and audits nothing new", async () => {
    rpc.mockResolvedValue({ data: { success: true, new_balance: 30000, duplicate: true }, error: null });
    const res = await POST(req({ tenant_id: TENANT, amount: 5000 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, newBalance: 30000, duplicate: true });
    expect(logAdminActivity).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "  ", "ok", 42, "x".repeat(501)])(
    "refuses a top-up with no usable reason (%s): money never moves unexplained",
    async (description) => {
      const res = await POST(req({ tenant_id: TENANT, amount: 5000, description }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/reason/i);
      expect(rpc).not.toHaveBeenCalled();
      expect(logAdminActivity).not.toHaveBeenCalled();
    },
  );

  it("writes the reason, trimmed, on the wallet line and in the staff log", async () => {
    rpc.mockResolvedValue({ data: { success: true, new_balance: 30000 }, error: null });
    await POST(req({ tenant_id: TENANT, amount: 5000, description: "  Refund for order 4261  " }));
    expect(rpc).toHaveBeenCalledWith("admin_topup_wallet", expect.objectContaining({ _description: "Refund for order 4261" }));
    expect(logAdminActivity).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ description: "Refund for order 4261" }) }),
    );
  });

  it.each([0, -5000, 1500.5, 10_000_001])("rejects amount %s", async (amount) => {
    const res = await POST(req({ tenant_id: TENANT, amount }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
