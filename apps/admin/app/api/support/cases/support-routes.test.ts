import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { AdminRole } from "@/types/admin";
import { AdminAuthError } from "@/lib/admin-auth-error";

/**
 * The support inbox routes, called for real with the real permission check;
 * only the Supabase layer (identity lookup + service-role client) is faked.
 */

const CASE_ID = "55555555-5555-4555-8555-555555555555";
const TENANT = "33333333-3333-4333-8333-333333333333";
const SUPPORT_ID = "22222222-2222-4222-8222-222222222222";

const IDENTITIES: Record<string, { user: { id: string; email: string }; role: AdminRole }> = {
  super: { user: { id: "11111111-1111-4111-8111-111111111111", email: "boss@example.com" }, role: "super_admin" },
  support: { user: { id: SUPPORT_ID, email: "agent@example.com" }, role: "support_staff" },
};

type DbResult = { data: unknown; error: { code: string; message: string } | null; count?: number };
type DbCall = { method: string; args: unknown[] };

const dbCalls: DbCall[] = [];
let dbResult: DbResult;
/** Per-await answers, consumed in order; `dbResult` answers once it is empty. */
const dbQueue: DbResult[] = [];

function fakeQuery(): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: DbResult) => void) => resolve(dbQueue.shift() ?? dbResult);
      }
      return (...args: unknown[]) => {
        dbCalls.push({ method: String(prop), args });
        return fakeQuery();
      };
    },
  });
}

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: vi.fn(() => fakeQuery()),
  requireAdmin: vi.fn(async (token: string) => {
    const identity = IDENTITIES[token];
    if (!identity) throw new AdminAuthError(401, "Invalid access token");
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
  dbCalls.length = 0;
  dbQueue.length = 0;
  dbResult = { data: null, error: null };
});

function req(pathname: string, method: string, token: string | null, body?: unknown): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest(`http://admin.test${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const caseParams = { params: Promise.resolve({ id: CASE_ID }) };

async function post(token: string | null, body: unknown, params = caseParams): Promise<Response> {
  const { POST } = await import("./[id]/route");
  return POST(req(`/api/support/cases/${CASE_ID}`, "POST", token, body), params);
}

const rpcCall = () => dbCalls.find((c) => c.method === "rpc");

describe("support inbox access", () => {
  it("turns away a caller with no session", async () => {
    const { GET } = await import("./route");
    expect((await GET(req("/api/support/cases", "GET", null))).status).toBe(401);
    const detail = await import("./[id]/route");
    expect((await detail.GET(req(`/api/support/cases/${CASE_ID}`, "GET", null), caseParams)).status).toBe(401);
    expect((await post(null, { action: "reply", body: "hi" })).status).toBe(401);
    expect(dbCalls).toHaveLength(0);
  });

  it.each(["super", "support"])("lets %s read the inbox", async (token) => {
    dbResult = { data: [], error: null, count: 0 };
    const { GET } = await import("./route");
    const res = await GET(req("/api/support/cases", "GET", token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cases: [], waitingOnUs: 0 });
  });

  it("answers the sidebar count without listing conversations", async () => {
    dbResult = { data: null, error: null, count: 4 };
    const { GET } = await import("./route");
    const res = await GET(req("/api/support/cases?view=count", "GET", "support"));
    expect(await res.json()).toEqual({ waitingOnUs: 4 });
    expect(dbCalls.filter((c) => c.method === "from")).toHaveLength(1);
  });
});

describe("support case actions", () => {
  it.each([
    ["an unknown action", { action: "delete" }],
    ["an empty reply", { action: "reply", body: "   " }],
    ["a reply over 4000 characters", { action: "reply", body: "x".repeat(4001) }],
    ["solving without a reason", { action: "solve" }],
    ["solving with a made-up reason", { action: "solve", reason: "because" }],
    ["no body at all", undefined],
  ])("refuses %s", async (_name, body) => {
    const res = await post("support", body);
    expect(res.status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("answers 404 for an id that is not a case id", async () => {
    const res = await post("support", { action: "reply", body: "hi" }, { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
    expect(dbCalls).toHaveLength(0);
  });

  it("replies as the signed-in admin, whatever the body claims", async () => {
    dbQueue.push(
      { data: { display_name: "Noor", email: "agent@example.com" }, error: null },
      { data: { case_id: CASE_ID, tenant_id: TENANT, message_id: "m1" }, error: null },
    );
    const res = await post("support", {
      action: "reply",
      body: "  on it  ",
      p_admin_id: "99999999-9999-4999-8999-999999999999",
      admin_name: "Someone else",
    });
    expect(res.status).toBe(200);
    expect(rpcCall()?.args).toEqual([
      "support_staff_reply",
      { p_case_id: CASE_ID, p_admin_id: SUPPORT_ID, p_admin_name: "Noor", p_body: "on it" },
    ]);
  });

  it("falls back to the admin's email when they have no display name", async () => {
    dbQueue.push(
      { data: { display_name: " ", email: "agent@example.com" }, error: null },
      { data: { case_id: CASE_ID, tenant_id: TENANT, message_id: "m1" }, error: null },
    );
    await post("support", { action: "reply", body: "hi" });
    expect(rpcCall()?.args[1]).toMatchObject({ p_admin_name: "agent@example.com" });
  });

  it("solves with the picked reason and records it in the activity log", async () => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: { case_id: CASE_ID, tenant_id: TENANT }, error: null },
    );
    const res = await post("support", { action: "solve", reason: "wallet_billing" });
    expect(res.status).toBe(200);
    expect(rpcCall()?.args).toEqual([
      "support_staff_solve",
      { p_case_id: CASE_ID, p_admin_id: SUPPORT_ID, p_admin_name: "Noor", p_reason: "wallet_billing" },
    ]);
    const logged = dbCalls.find((c) => c.method === "insert")?.args[0];
    expect(logged).toMatchObject({
      admin_user_id: SUPPORT_ID,
      tenant_id: TENANT,
      action: "support_case_solved",
      details: { case_id: CASE_ID, reason: "wallet_billing" },
    });
  });

  it.each([
    ["support_case_solved", 409],
    ["support_case_not_found", 404],
    ["support_empty_message", 400],
  ])("maps the database refusal %s to %i", async (message, status) => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: null, error: { code: "P0001", message } },
    );
    const res = await post("support", { action: "reply", body: "hi" });
    expect(res.status).toBe(status);
  });

  it("reports a real database failure as 500, not as a refusal", async () => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } },
    );
    const res = await post("support", { action: "reply", body: "hi" });
    expect(res.status).toBe(500);
  });

  it("takes ownership only of a conversation that is still open", async () => {
    dbQueue.push({ data: { display_name: "Noor", email: null }, error: null }, { data: null, error: null });
    const res = await post("support", { action: "assign" });
    expect(res.status).toBe(409);
    expect(dbCalls.find((c) => c.method === "update")?.args[0]).toMatchObject({
      owner_admin_id: SUPPORT_ID,
      owner_name: "Noor",
    });
    expect(dbCalls.some((c) => c.method === "neq" && c.args[0] === "status" && c.args[1] === "solved")).toBe(true);
  });
});

describe("support phone alerts", () => {
  const SUB = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "BPk", auth: "xyz" },
  };

  async function push(method: "POST" | "DELETE", token: string | null, body: unknown): Promise<Response> {
    const route = await import("../push/route");
    return route[method](req("/api/support/push", method, token, body));
  }

  it("turns away a caller with no session", async () => {
    expect((await push("POST", null, SUB)).status).toBe(401);
    expect((await push("DELETE", null, { endpoint: SUB.endpoint })).status).toBe(401);
    expect(dbCalls).toHaveLength(0);
  });

  it.each([
    ["no body", undefined],
    ["an http endpoint", { ...SUB, endpoint: "http://push.example/abc" }],
    ["missing keys", { endpoint: SUB.endpoint }],
    ["an oversized key", { ...SUB, keys: { p256dh: "x".repeat(201), auth: "a" } }],
  ])("refuses %s", async (_name, body) => {
    expect((await push("POST", "support", body)).status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("stores the device for the signed-in admin, whatever the body claims", async () => {
    const res = await push("POST", "support", { ...SUB, admin_user_id: "11111111-1111-4111-8111-111111111111" });
    expect(res.status).toBe(200);
    const upsert = dbCalls.find((c) => c.method === "upsert");
    expect(upsert?.args[0]).toEqual({
      admin_user_id: SUPPORT_ID,
      endpoint: SUB.endpoint,
      p256dh: "BPk",
      auth: "xyz",
      user_agent: null,
    });
    expect(upsert?.args[1]).toEqual({ onConflict: "endpoint" });
  });

  it("only removes the caller's own device", async () => {
    const res = await push("DELETE", "support", { endpoint: SUB.endpoint });
    expect(res.status).toBe(200);
    const filters = dbCalls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(filters).toEqual([
      ["endpoint", SUB.endpoint],
      ["admin_user_id", SUPPORT_ID],
    ]);
  });
});
