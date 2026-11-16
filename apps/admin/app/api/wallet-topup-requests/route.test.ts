import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const REQ_ID = "44444444-4444-4444-8444-444444444444";
const TENANT = "33333333-3333-4333-8333-333333333333";

const rpc = vi.fn();
const createSignedUrls = vi.fn();

/** What the decision route reads about the request before it decides. */
let asked: { data: unknown; error: { message: string } | null } = { data: null, error: null };

function askedQuery() {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: () => Promise.resolve(asked),
  };
  return q;
}

const logAdminAction = vi.fn(async () => undefined);
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    rpc,
    from: () => askedQuery(),
    storage: { from: () => ({ createSignedUrls }) },
  }),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: vi.fn(async () => ({ user: { id: ADMIN_ID }, role: "super_admin" })),
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN_ID }, role: "super_admin" })),
}));

const { GET } = await import("./route");
const { POST } = await import("./[id]/route");
const { requireAdminPermission } = await import("@/lib/api-auth");

/** The next request comes from a support staff login (checks receipts, no plain top-up). */
function asSupportStaff() {
  vi.mocked(requireAdminPermission).mockResolvedValueOnce({ user: { id: ADMIN_ID }, role: "support_staff" });
}

function post(body: unknown, id = REQ_ID) {
  return POST(
    new NextRequest(`http://localhost/api/wallet-topup-requests/${id}`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  rpc.mockReset();
  createSignedUrls.mockReset();
  logAdminAction.mockClear();
  asked = { data: { tenant_id: TENANT, amount_iqd: 25000, method: "qi_card" }, error: null };
});

describe("POST /api/wallet-topup-requests/[id]", () => {
  it("approves the shop's own figure through the database with the acting admin", async () => {
    rpc.mockResolvedValue({ data: { success: true, outcome: "approved", credited: 25000, receipt_no: 7 }, error: null });
    const res = await post({ approve: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, outcome: "approved", credited: 25000, receipt_no: 7 });
    expect(rpc).toHaveBeenCalledWith("decide_wallet_topup_request", {
      _request_id: REQ_ID,
      _approve: true,
      _admin_id: ADMIN_ID,
      _amount: undefined,
      _reason: undefined,
      _may_add_more: true,
    });
  });

  it("approves what really arrived when staff type a different amount", async () => {
    rpc.mockResolvedValue({ data: { success: true, outcome: "approved", credited: 20000, receipt_no: 8 }, error: null });
    await post({ approve: true, amount: 20000 });
    expect(rpc).toHaveBeenCalledWith("decide_wallet_topup_request", expect.objectContaining({ _amount: 20000, _reason: undefined }));
  });

  it("lets support staff credit only up to what the shop said it sent", async () => {
    asSupportStaff();
    rpc.mockResolvedValue({ data: { success: true, outcome: "approved", credited: 20000, receipt_no: 9 }, error: null });
    expect((await post({ approve: true, amount: 20000 })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("decide_wallet_topup_request", expect.objectContaining({ _amount: 20000, _may_add_more: false }));
  });

  it("answers 403 and logs nothing when support staff try to add more than the shop sent", async () => {
    asSupportStaff();
    rpc.mockResolvedValue({ data: { success: false, error: "over_asked" }, error: null });
    const res = await post({ approve: true, amount: 10_000_000 });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("More than the shop sent needs a super admin");
    expect(rpc).toHaveBeenCalledWith("decide_wallet_topup_request", expect.objectContaining({ _amount: 10_000_000, _may_add_more: false }));
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("refuses with the reason the shop will read, trimmed", async () => {
    rpc.mockResolvedValue({ data: { success: true, outcome: "rejected" }, error: null });
    const res = await post({ approve: false, reason: "  The receipt is cut off  " });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("decide_wallet_topup_request", {
      _request_id: REQ_ID,
      _approve: false,
      _admin_id: ADMIN_ID,
      _amount: undefined,
      _reason: "The receipt is cut off",
      _may_add_more: true,
    });
  });

  it("writes the decision to the staff log with the shop, the amount and what was added or why not", async () => {
    rpc.mockResolvedValue({ data: { success: true, outcome: "approved", credited: 20000, receipt_no: 8 }, error: null });
    await post({ approve: true, amount: 20000 });
    rpc.mockResolvedValue({ data: { success: true, outcome: "rejected" }, error: null });
    await post({ approve: false, reason: "Wrong account" });

    expect(logAdminAction.mock.calls.map((call) => call.slice(1))).toEqual([
      [
        "approve_topup_request",
        {
          tenantId: TENANT,
          details: { request_id: REQ_ID, amount_iqd: 25000, method: "qi_card", outcome: "approved", credited_iqd: 20000, receipt_no: 8 },
        },
      ],
      [
        "reject_topup_request",
        {
          tenantId: TENANT,
          details: { request_id: REQ_ID, amount_iqd: 25000, method: "qi_card", outcome: "rejected", reason: "Wrong account" },
        },
      ],
    ]);
  });

  it("answers 409 for a request already decided, so a double click adds nothing", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "already_decided", outcome: "approved" }, error: null });
    expect((await post({ approve: true })).status).toBe(409);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404],
    ["bad_amount", 400],
    ["reason_required", 400],
    ["admin_required", 422],
  ])("turns the database's %s into %i and logs nothing", async (code, status) => {
    rpc.mockResolvedValue({ data: { success: false, error: code }, error: null });
    expect((await post({ approve: true })).status).toBe(status);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("stops before the money moves when the request cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    asked = { data: null, error: { message: "connection lost" } };
    expect((await post({ approve: true })).status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["approve is not a boolean", { approve: "yes" }],
    ["a refusal without a reason", { approve: false }],
    ["a reason too short to tell the shop anything", { approve: false, reason: " ok " }],
    ["a reason over 300 characters", { approve: false, reason: "x".repeat(301) }],
    ["an amount below 1,000 IQD", { approve: true, amount: 500 }],
    ["an amount above 10,000,000 IQD", { approve: true, amount: 10_000_001 }],
    ["an amount with fils", { approve: true, amount: 1500.5 }],
  ])("refuses %s before touching the database", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a bad id before touching the database", async () => {
    expect((await post({ approve: true }, "not-a-uuid")).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("GET /api/wallet-topup-requests", () => {
  const row = {
    id: REQ_ID,
    tenant_id: TENANT,
    display_id: 100095,
    business_name: "Test",
    tenant_status: "active",
    amount_iqd: 25000,
    method: "qi_card",
    receipt_path: `${TENANT}/r.PDF`,
    created_at: "2026-11-10T00:00:00Z",
    balance_iqd: "1200",
    billing: { locked: true, reason: "unpaid", plan: "basic", price_iqd: "9000" },
    same_file: [],
    same_amount_recent: 0,
  };

  it("returns the queue from one database call, with a receipt link and never the storage path", async () => {
    rpc.mockResolvedValue({ data: { requests: [row] }, error: null });
    createSignedUrls.mockResolvedValue({ data: [{ path: `${TENANT}/r.PDF`, signedUrl: "https://signed/r.pdf" }], error: null });
    const res = await GET(new NextRequest("http://localhost/api/wallet-topup-requests"));
    const body = await res.json();
    expect(rpc).toHaveBeenCalledWith("admin_topup_queue");
    expect(createSignedUrls).toHaveBeenCalledWith([`${TENANT}/r.PDF`], 900);
    expect(body.requests[0]).toMatchObject({
      receipt_url: "https://signed/r.pdf",
      receipt_kind: "pdf",
      balance_iqd: 1200,
      billing: { locked: true, price_iqd: 9000 },
    });
    expect(body.requests[0]).not.toHaveProperty("receipt_path");
  });

  it("answers an empty queue without signing anything", async () => {
    rpc.mockResolvedValue({ data: { requests: [] }, error: null });
    const body = await (await GET(new NextRequest("http://localhost/api/wallet-topup-requests"))).json();
    expect(body).toEqual({ requests: [] });
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("is a 500, not an empty queue, when the database answer cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: { requests: [{ id: "nope" }] }, error: null });
    expect((await GET(new NextRequest("http://localhost/api/wallet-topup-requests"))).status).toBe(500);
  });
});
