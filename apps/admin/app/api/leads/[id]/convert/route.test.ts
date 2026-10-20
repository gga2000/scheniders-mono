import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { AdminRole } from "@/types/admin";

/**
 * The conversion itself lives in `public.convert_lead_atomic` (one transaction,
 * row lock on the lead). These tests pin the route's side of the contract: it
 * makes exactly one RPC call with the caller's identity, never writes tables
 * itself, and maps each RPC outcome to the right HTTP answer.
 */

const SUPPORT_ID = "22222222-2222-4222-8222-222222222222";
const LEAD = "44444444-4444-4444-8444-444444444444";
const TENANT = "33333333-3333-4333-8333-333333333333";

const IDENTITIES: Record<string, { user: { id: string; email: string }; role: AdminRole }> = {
  support: { user: { id: SUPPORT_ID, email: "agent@example.com" }, role: "support_staff" },
};

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<RpcResult>>();
const from = vi.fn();
const createAdminClient = vi.fn(() => ({ rpc, from }));

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient,
  requireAdmin: vi.fn(async (token: string) => {
    const identity = IDENTITIES[token];
    if (!identity) throw new Error("Invalid access token");
    return identity;
  }),
  resolveAdminRole: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  rpc.mockReset();
  from.mockReset();
  createAdminClient.mockClear();
});

function convert(body: unknown, id: string = LEAD): Promise<Response> {
  return import("./route").then(({ POST }) =>
    POST(
      new NextRequest(`http://admin.test/api/leads/${id}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer support" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    ),
  );
}

describe("POST /api/leads/[id]/convert", () => {
  it("converts through one RPC call attributed to the caller, ignoring client-chosen plan and creator", async () => {
    rpc.mockResolvedValue({ data: { outcome: "converted", tenant_id: TENANT }, error: null });

    const res = await convert({ plan: "enterprise", created_by: "someone-else", notes: "  signed on the call  " });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, tenant_id: TENANT });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("convert_lead_atomic", {
      _lead_id: LEAD,
      _actor_id: SUPPORT_ID,
      _notes: "signed on the call",
    });
    // No table is written outside the transactional function.
    expect(from).not.toHaveBeenCalled();
  });

  it("is idempotent: a repeat call for a converted lead returns the existing tenant with 409", async () => {
    rpc
      .mockResolvedValueOnce({ data: { outcome: "converted", tenant_id: TENANT }, error: null })
      .mockResolvedValueOnce({ data: { outcome: "already_converted", tenant_id: TENANT }, error: null });

    const first = await convert({});
    const second = await convert({});

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "Lead already converted", tenant_id: TENANT });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a lead whose status was set to converted by hand (no tenant) with 409", async () => {
    rpc.mockResolvedValue({ data: { outcome: "already_converted", tenant_id: null }, error: null });
    const res = await convert({});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Lead already converted", tenant_id: null });
  });

  it("maps a missing lead to 404", async () => {
    rpc.mockResolvedValue({ data: { outcome: "not_found" }, error: null });
    const res = await convert({});
    expect(res.status).toBe(404);
  });

  it("maps a prospect store that is no longer an open trial to 400", async () => {
    rpc.mockResolvedValue({ data: { outcome: "prospect_not_open" }, error: null });
    const res = await convert({});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no longer an open trial/);
  });

  it("returns 500 and does not report success when the RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "convert_lead_atomic is service-role only" } });
    const res = await convert({});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to convert lead" });
  });

  it("returns 500 for an RPC result it does not recognise", async () => {
    rpc.mockResolvedValue({ data: { outcome: "converted" }, error: null });
    const res = await convert({});
    expect(res.status).toBe(500);
  });

  it("rejects a non-uuid lead id and an invalid body before touching the database", async () => {
    const badId = await convert({}, "not-a-uuid");
    const badJson = await convert("{");
    const longNotes = await convert({ notes: "x".repeat(2001) });

    expect(badId.status).toBe(404);
    expect(badJson.status).toBe(400);
    expect(longNotes.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
