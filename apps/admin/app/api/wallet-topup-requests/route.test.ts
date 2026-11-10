import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const REQ_ID = "44444444-4444-4444-8444-444444444444";
const TENANT = "33333333-3333-4333-8333-333333333333";

const rpc = vi.fn();
const createSignedUrls = vi.fn();
let rows: unknown[] = [];

function listQuery() {
  const q = {
    select: () => q,
    is: () => q,
    order: () => q,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return q;
}

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    rpc,
    from: () => listQuery(),
    storage: { from: () => ({ createSignedUrls }) },
  }),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: vi.fn(async () => ({ user: { id: ADMIN_ID }, role: "super_admin" })),
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN_ID }, role: "super_admin" })),
}));

const { GET } = await import("./route");
const { POST } = await import("./[id]/route");

function post(body: unknown, id = REQ_ID) {
  return POST(
    new NextRequest(`http://localhost/api/wallet-topup-requests/${id}`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  rpc.mockReset();
  createSignedUrls.mockReset();
  rows = [];
});

describe("POST /api/wallet-topup-requests/[id]", () => {
  it("approves through the database with the acting admin", async () => {
    rpc.mockResolvedValue({ data: { success: true, outcome: "approved", new_balance: 25000 }, error: null });
    const res = await post({ approve: true });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("decide_wallet_topup_request", {
      _request_id: REQ_ID,
      _approve: true,
      _admin_id: ADMIN_ID,
    });
  });

  it("answers 409 for a request already decided, so a double click adds nothing", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "already_decided", outcome: "approved" }, error: null });
    expect((await post({ approve: true })).status).toBe(409);
  });

  it("refuses a bad body or id before touching the database", async () => {
    expect((await post({ approve: "yes" })).status).toBe(400);
    expect((await post({ approve: true }, "not-a-uuid")).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("GET /api/wallet-topup-requests", () => {
  it("returns open requests with a receipt link and never the storage path", async () => {
    rows = [{
      id: REQ_ID,
      tenant_id: TENANT,
      amount_iqd: 25000,
      method: "zain_cash",
      receipt_path: `${TENANT}/r.jpg`,
      created_at: "2026-11-10T00:00:00Z",
      tenants: { business_name: "Test", slug: "t" },
    }];
    createSignedUrls.mockResolvedValue({ data: [{ path: `${TENANT}/r.jpg`, signedUrl: "https://signed/r.jpg" }], error: null });
    const res = await GET(new NextRequest("http://localhost/api/wallet-topup-requests"));
    const body = await res.json();
    expect(body.requests[0].receipt_url).toBe("https://signed/r.jpg");
    expect(body.requests[0]).not.toHaveProperty("receipt_path");
  });
});
