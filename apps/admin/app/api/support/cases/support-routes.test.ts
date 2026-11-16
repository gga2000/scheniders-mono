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
      // `db.auth.admin` are properties, not calls.
      if (prop === "auth" || prop === "admin") return fakeQuery();
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

vi.mock("@/lib/admin-env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://db.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    PLATFORM_URL: "https://app.test",
  },
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

describe("support saved replies", () => {
  const REPLY_ID = "66666666-6666-4666-8666-666666666666";
  const replyParams = { params: Promise.resolve({ id: REPLY_ID }) };

  async function list(token: string | null): Promise<Response> {
    const { GET } = await import("../replies/route");
    return GET(req("/api/support/replies", "GET", token));
  }
  async function add(token: string | null, body: unknown): Promise<Response> {
    const { POST } = await import("../replies/route");
    return POST(req("/api/support/replies", "POST", token, body));
  }
  async function one(method: "PATCH" | "DELETE", token: string | null, body?: unknown, params = replyParams) {
    const route = await import("../replies/[id]/route");
    return route[method](req(`/api/support/replies/${REPLY_ID}`, method, token, body), params);
  }

  it("turns away a caller with no session", async () => {
    expect((await list(null)).status).toBe(401);
    expect((await add(null, { title: "Hi", body: "أهلاً" })).status).toBe(401);
    expect((await one("PATCH", null, { title: "Hi", body: "أهلاً" })).status).toBe(401);
    expect((await one("DELETE", null)).status).toBe(401);
    expect(dbCalls).toHaveLength(0);
  });

  it("lists replies in the team's order", async () => {
    dbResult = { data: [{ id: REPLY_ID, title: "Greeting", body: "أهلاً", position: 10, updated_at: "x" }], error: null };
    const res = await list("support");
    expect(res.status).toBe(200);
    expect((await res.json()).replies).toHaveLength(1);
    const order = dbCalls.filter((c) => c.method === "order").map((c) => c.args[0]);
    expect(order).toEqual(["position", "title"]);
  });

  it.each([
    ["no body", undefined],
    ["an empty title", { title: "  ", body: "أهلاً" }],
    ["a title over 40 characters", { title: "x".repeat(41), body: "أهلاً" }],
    ["an empty text", { title: "Hi", body: "   " }],
    ["a text over 2000 characters", { title: "Hi", body: "x".repeat(2001) }],
    ["a negative order", { title: "Hi", body: "أهلاً", position: -1 }],
  ])("refuses %s", async (_name, body) => {
    expect((await add("support", body)).status).toBe(400);
    expect((await one("PATCH", "support", body)).status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("records who added a reply, whatever the body claims", async () => {
    dbResult = { data: { id: REPLY_ID }, error: null };
    const res = await add("support", { title: " Hi ", body: " أهلاً {name} ", created_by: "someone" });
    expect(res.status).toBe(200);
    const insert = dbCalls.find((c) => c.method === "insert" && (c.args[0] as { title?: string }).title === "Hi");
    expect(insert?.args[0]).toEqual({
      title: "Hi",
      body: "أهلاً {name}",
      position: 1000,
      created_by: SUPPORT_ID,
      updated_by: SUPPORT_ID,
    });
  });

  it("changes one reply and records who changed it", async () => {
    dbResult = { data: { id: REPLY_ID }, error: null };
    const res = await one("PATCH", "support", { title: "Hi", body: "أهلاً", position: 5 });
    expect(res.status).toBe(200);
    const update = dbCalls.find((c) => c.method === "update");
    expect(update?.args[0]).toMatchObject({ title: "Hi", body: "أهلاً", position: 5, updated_by: SUPPORT_ID });
    expect(dbCalls.find((c) => c.method === "eq")?.args).toEqual(["id", REPLY_ID]);
  });

  it("answers 404 for a reply that is gone, every time", async () => {
    dbResult = { data: null, error: null };
    for (let i = 0; i < 2; i++) {
      const res = await one("DELETE", "support");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "This saved reply no longer exists." });
    }
    const bad = await one("PATCH", "support", { title: "Hi", body: "أهلاً" }, { params: Promise.resolve({ id: "1" }) });
    expect(bad.status).toBe(404);
  });
});

describe("support scoreboard", () => {
  const BOARD = {
    days: 30,
    opened: 3,
    answered: 2,
    reached_out: 1,
    first_reply_median_s: 90,
    first_reply_p90_s: 300,
    answered_within_5m: 2,
    solved: 1,
    solve_median_s: 3600,
    rated_yes: 1,
    rated_no: 0,
    reopened: 0,
    reasons: [{ reason: "orders", count: 1 }],
    by_staff: [{ name: "Noor", solved: 1, rated_yes: 1, rated_no: 0 }],
    waiting_now: 1,
    oldest_wait_s: 120,
  };

  async function board(token: string | null, query = ""): Promise<Response> {
    const { GET } = await import("../scoreboard/route");
    return GET(req(`/api/support/scoreboard${query}`, "GET", token));
  }

  it("turns away a caller with no session", async () => {
    expect((await board(null)).status).toBe(401);
    expect(dbCalls).toHaveLength(0);
  });

  it.each(["?days=14", "?days=abc", "?days=0"])("refuses a window it does not offer (%s)", async (query) => {
    expect((await board("support", query)).status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("asks the database for the window and passes its answer on", async () => {
    dbResult = { data: BOARD, error: null };
    const res = await board("support", "?days=30");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(BOARD);
    expect(rpcCall()?.args).toEqual(["support_scoreboard", { p_days: 30 }]);
  });

  it("defaults to 7 days", async () => {
    dbResult = { data: { ...BOARD, days: 7 }, error: null };
    expect((await board("super")).status).toBe(200);
    expect(rpcCall()?.args).toEqual(["support_scoreboard", { p_days: 7 }]);
  });

  it("says it failed rather than drawing zeros when the answer is not the expected shape", async () => {
    dbResult = { data: { opened: 0 }, error: null };
    expect((await board("support")).status).toBe(500);
  });
});

describe("support shop check", () => {
  async function check(token: string | null, id = CASE_ID): Promise<Response> {
    const { GET } = await import("./[id]/check/route");
    return GET(req(`/api/support/cases/${id}/check`, "GET", token), { params: Promise.resolve({ id }) });
  }

  const FACTS = {
    store: {
      status: "active",
      is_prospect: false,
      is_demo: false,
      paused: false,
      blocks_new_orders: false,
      paused_until: null,
      pause_reason: null,
      lock_reason: null,
      lock_since: null,
      trial_ends_at: null,
    },
    products: { on_store: 1, sold_out_marked: 0, no_stock: 0 },
    waseet: { calls_7d: 0, failed_7d: 0, last_error: null, last_error_at: null },
    prime: null,
    whatsapp: { paused: false, pause_reason: null, paused_at: null, sent_7d: 0, delivered_7d: 0, failed_7d: 0 },
    wallet: { balance_iqd: 0, threshold_iqd: 5000 },
    orders: { last_at: null, last_7d: 0 },
    errors: { count_7d: 0, last_message: null, last_path: null, last_at: null },
    checked_at: "2026-11-16T09:37:53Z",
  };

  it("turns away a caller with no session", async () => {
    expect((await check(null)).status).toBe(401);
    expect(dbCalls).toHaveLength(0);
  });

  it("answers 404 for an id that is not a conversation", async () => {
    expect((await check("support", "nope")).status).toBe(404);
    expect(dbCalls).toHaveLength(0);
    dbResult = { data: null, error: null };
    expect((await check("support")).status).toBe(404);
    expect(rpcCall()).toBeUndefined();
  });

  it("checks the shop that wrote the conversation, never one the caller names", async () => {
    dbQueue.push({ data: { tenant_id: TENANT }, error: null }, { data: FACTS, error: null });
    const res = await check("support");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenantId: TENANT, check: FACTS });
    expect(rpcCall()?.args).toEqual(["support_shop_check", { p_tenant_id: TENANT }]);
  });

  it("says it failed when the answer is not the expected shape", async () => {
    dbQueue.push({ data: { tenant_id: TENANT }, error: null }, { data: { store: {} }, error: null });
    expect((await check("support")).status).toBe(500);
  });
});

describe("support needs us", () => {
  const SHOP = {
    tenant_id: TENANT,
    business_name: "Amal",
    display_id: 100012,
    status: "active",
    problems: [
      { code: "orders_stopped", since: "2026-11-14T04:01:05+00:00", detail: "262" },
      { code: "wallet_empty", since: "2026-11-15T23:43:51+00:00", detail: "0" },
    ],
    owner_name: "Amal Owner",
    open_case: null,
    last_contact_at: null,
  };

  async function list(token: string | null): Promise<Response> {
    const { GET } = await import("../needs-us/route");
    return GET(req("/api/support/needs-us", "GET", token));
  }

  async function start(token: string | null, body: unknown): Promise<Response> {
    const { POST } = await import("../needs-us/route");
    return POST(req("/api/support/needs-us", "POST", token, body));
  }

  it("turns away a caller with no session", async () => {
    expect((await list(null)).status).toBe(401);
    expect((await start(null, { tenantId: TENANT, body: "hi" })).status).toBe(401);
    expect(dbCalls).toHaveLength(0);
  });

  it("passes on the database's list of shops", async () => {
    dbResult = { data: [SHOP], error: null };
    const res = await list("support");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shops: [SHOP] });
    expect(rpcCall()?.args).toEqual(["support_shops_needing_us"]);
  });

  it("says it failed rather than showing an empty list when the answer is not the expected shape", async () => {
    dbResult = { data: [{ ...SHOP, problems: [{ code: "made_up", since: null, detail: null }] }], error: null };
    expect((await list("support")).status).toBe(500);
  });

  it.each([
    ["no shop", { body: "hi" }],
    ["a shop id that is not an id", { tenantId: "1", body: "hi" }],
    ["an empty message", { tenantId: TENANT, body: "   " }],
    ["a message over 4000 characters", { tenantId: TENANT, body: "x".repeat(4001) }],
  ])("refuses %s", async (_label, body) => {
    expect((await start("support", body)).status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("writes first as the signed-in admin, whatever the body claims, and logs it", async () => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: { case_id: CASE_ID, tenant_id: TENANT, message_id: "m1", started: true }, error: null },
    );
    const res = await start("support", { tenantId: TENANT, body: "  هلا  ", p_admin_id: "x", adminName: "Boss" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ caseId: CASE_ID, started: true });
    expect(rpcCall()?.args).toEqual([
      "support_staff_start",
      { p_tenant_id: TENANT, p_admin_id: SUPPORT_ID, p_admin_name: "Noor", p_body: "هلا" },
    ]);
    expect(dbCalls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      admin_user_id: SUPPORT_ID,
      tenant_id: TENANT,
      action: "support_reached_out",
      details: { case_id: CASE_ID, started: true },
    });
  });

  it.each([
    ["support_shop_not_found", 404],
    ["support_shop_has_nobody", 409],
    ["support_empty_message", 400],
  ])("maps the database refusal %s to %i", async (message, status) => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: null, error: { code: "P0001", message } },
    );
    expect((await start("support", { tenantId: TENANT, body: "hi" })).status).toBe(status);
  });
});

describe("support first-week calls", () => {
  const TASK_ID = "66666666-6666-4666-8666-666666666666";
  const TASK = {
    id: TASK_ID,
    kind: "welcome_call",
    due_at: "2026-11-16T09:00:00+00:00",
    attempts: 0,
    phone: null,
    requested_by: null,
    tenant_id: TENANT,
    business_name: "Amal",
    display_id: 100120,
    trial_ends_at: "2026-11-23T09:00:00+00:00",
    shop_status: "trial",
    orders: 0,
    owner_id: SUPPORT_ID,
    owner_name: "Noor",
    calls: [],
  };

  async function list(token: string | null): Promise<Response> {
    const { GET } = await import("../tasks/route");
    return GET(req("/api/support/tasks", "GET", token));
  }

  async function log(token: string | null, body: unknown): Promise<Response> {
    const { POST } = await import("../tasks/route");
    return POST(req("/api/support/tasks", "POST", token, body));
  }

  it("turns away a caller with no session", async () => {
    expect((await list(null)).status).toBe(401);
    expect((await log(null, { taskId: TASK_ID, outcome: "done" })).status).toBe(401);
    expect(dbCalls).toHaveLength(0);
  });

  it("passes on today's tasks with who is asking", async () => {
    dbResult = { data: [TASK], error: null };
    const res = await list("support");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tasks: [TASK], me: SUPPORT_ID });
    expect(rpcCall()?.args).toEqual(["support_tasks_due"]);
  });

  it("says it failed when a task has a kind it does not know", async () => {
    dbResult = { data: [{ ...TASK, kind: "party" }], error: null };
    expect((await list("support")).status).toBe(500);
  });

  it.each([
    ["no task", { outcome: "done" }],
    ["a task id that is not an id", { taskId: "1", outcome: "done" }],
    ["a made-up outcome", { taskId: TASK_ID, outcome: "maybe" }],
    ["a note over 500 characters", { taskId: TASK_ID, outcome: "later", note: "x".repeat(501) }],
  ])("refuses %s", async (_label, body) => {
    expect((await log("support", body)).status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("records the call as the signed-in admin, whatever the body claims, and logs it", async () => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: { task_id: TASK_ID, tenant_id: TENANT }, error: null },
    );
    const res = await log("support", { taskId: TASK_ID, outcome: "no_answer", note: "  رن ولا جواب ", p_admin_id: "x" });
    expect(res.status).toBe(200);
    expect(rpcCall()?.args).toEqual([
      "support_task_log",
      { p_task_id: TASK_ID, p_admin_id: SUPPORT_ID, p_admin_name: "Noor", p_outcome: "no_answer", p_note: "رن ولا جواب" },
    ]);
    expect(dbCalls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      admin_user_id: SUPPORT_ID,
      tenant_id: TENANT,
      action: "support_task_logged",
      details: { task_id: TASK_ID, outcome: "no_answer" },
    });
  });

  it.each([
    ["support_task_not_found", 404],
    ["support_task_already_done", 409],
    ["support_bad_outcome", 400],
  ])("maps the database refusal %s to %i", async (message, status) => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: null, error: { code: "P0001", message } },
    );
    expect((await log("support", { taskId: TASK_ID, outcome: "done" })).status).toBe(status);
  });
});

describe("support take a shop", () => {
  async function take(token: string | null, body: unknown): Promise<Response> {
    const { POST } = await import("../owner/route");
    return POST(req("/api/support/owner", "POST", token, body));
  }

  it("turns away a caller with no session", async () => {
    expect((await take(null, { tenantId: TENANT })).status).toBe(401);
    expect(dbCalls).toHaveLength(0);
  });

  it("refuses a shop id that is not an id", async () => {
    expect((await take("support", { tenantId: "1" })).status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("answers 404 for a shop that does not exist", async () => {
    dbQueue.push({ data: null, error: null });
    expect((await take("support", { tenantId: TENANT })).status).toBe(404);
    expect(dbCalls.some((c) => c.method === "upsert")).toBe(false);
  });

  it("makes the signed-in admin the shop's person, whatever the body claims, and logs it", async () => {
    dbQueue.push({ data: { id: TENANT }, error: null }, { data: null, error: null });
    const res = await take("support", { tenantId: TENANT, adminId: "11111111-1111-4111-8111-111111111111" });
    expect(res.status).toBe(200);
    const upsert = dbCalls.find((c) => c.method === "upsert");
    expect(upsert?.args[0]).toMatchObject({ tenant_id: TENANT, admin_id: SUPPORT_ID, assigned_by: SUPPORT_ID });
    expect(upsert?.args[1]).toEqual({ onConflict: "tenant_id" });
    expect(dbCalls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      admin_user_id: SUPPORT_ID,
      tenant_id: TENANT,
      action: "support_shop_taken",
    });
  });
});

describe("support view as merchant", () => {
  const VIEWER = "77777777-7777-4777-8777-777777777777";
  const EXPIRES = "2026-11-16T12:00:00+00:00";

  async function start(token: string | null, body: unknown): Promise<Response> {
    const { POST } = await import("../view/route");
    return POST(req("/api/support/view", "POST", token, body));
  }

  async function stop(token: string | null): Promise<Response> {
    const { DELETE } = await import("../view/route");
    return DELETE(req("/api/support/view", "DELETE", token));
  }

  const link = { data: { properties: { hashed_token: "hash-1" }, user: { id: VIEWER } }, error: null };

  it("turns away a caller with no session", async () => {
    expect((await start(null, { tenantId: TENANT })).status).toBe(401);
    expect((await stop(null)).status).toBe(401);
    expect(dbCalls).toHaveLength(0);
  });

  it("refuses a shop id that is not an id", async () => {
    expect((await start("support", { tenantId: "1" })).status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("opens the shop with my own viewer, logs the visit the merchant sees, and answers a one-time link", async () => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: { user_id: VIEWER }, error: null },
      { data: { session_id: "s1", expires_at: EXPIRES }, error: null },
      link as unknown as DbResult,
    );
    const res = await start("support", { tenantId: TENANT, adminId: "11111111-1111-4111-8111-111111111111" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; expiresAt: string };
    expect(body.expiresAt).toBe(EXPIRES);
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe("https://app.test/api/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe("hash-1");
    expect(url.searchParams.get("type")).toBe("magiclink");
    expect(url.searchParams.get("next")).toBe("/orders");
    expect(rpcCall()?.args).toEqual([
      "support_view_start",
      { p_admin_id: SUPPORT_ID, p_viewer_user_id: VIEWER, p_tenant_id: TENANT },
    ]);
    expect(dbCalls.find((c) => c.method === "generateLink")?.args[0]).toEqual({
      type: "magiclink",
      email: `support-viewer-${SUPPORT_ID}@usefermi.com`,
    });
    expect(dbCalls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      admin_user_id: SUPPORT_ID,
      tenant_id: TENANT,
      action: "support_view",
    });
    expect(dbCalls.some((c) => c.method === "createUser")).toBe(false);
  });

  it("makes my viewer sign-in once, flagged look-only", async () => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: null, error: null },
      { data: { user: { id: VIEWER } }, error: null } as unknown as DbResult,
      { data: null, error: null },
      { data: null, error: null },
      { data: { session_id: "s1", expires_at: EXPIRES }, error: null },
      link as unknown as DbResult,
    );
    expect((await start("support", { tenantId: TENANT })).status).toBe(200);
    expect(dbCalls.find((c) => c.method === "createUser")?.args[0]).toMatchObject({
      email: `support-viewer-${SUPPORT_ID}@usefermi.com`,
      email_confirm: true,
      app_metadata: { support_viewer: true },
    });
    expect(dbCalls.find((c) => c.method === "upsert")?.args[0]).toMatchObject({ id: VIEWER, role: "viewer" });
    expect(dbCalls.find((c) => c.method === "insert")?.args[0]).toEqual({ user_id: VIEWER, admin_id: SUPPORT_ID });
  });

  it("never answers a link made for another sign-in", async () => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: { user_id: VIEWER }, error: null },
      { data: { session_id: "s1", expires_at: EXPIRES }, error: null },
      { data: { properties: { hashed_token: "hash-1" }, user: { id: "someone-else" } }, error: null } as unknown as DbResult,
    );
    expect((await start("support", { tenantId: TENANT })).status).toBe(500);
  });

  it.each([
    ["support_view_unguarded", 503],
    ["support_view_not_your_viewer", 409],
    ["support_shop_not_found", 404],
  ])("maps the database refusal %s to %i", async (message, status) => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: { user_id: VIEWER }, error: null },
      { data: null, error: { code: "P0001", message } },
    );
    expect((await start("support", { tenantId: TENANT })).status).toBe(status);
    expect(dbCalls.some((c) => c.method === "generateLink")).toBe(false);
  });

  it("ends my own look", async () => {
    dbResult = { data: 1, error: null };
    expect((await stop("support")).status).toBe(200);
    expect(rpcCall()?.args).toEqual(["support_view_end", { p_admin_id: SUPPORT_ID }]);
    expect(dbCalls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      admin_user_id: SUPPORT_ID,
      action: "support_view_end",
      details: { ended: 1 },
    });
  });
});

describe("support notices", () => {
  const NOTICE = {
    id: "88888888-8888-4888-8888-888888888888",
    body: "برايم متأخر اليوم",
    created_by_name: "Noor",
    created_at: "2026-11-16T12:00:00+00:00",
    ends_at: "2026-11-16T18:00:00+00:00",
  };

  async function call(method: "GET" | "POST" | "DELETE", token: string | null, body?: unknown): Promise<Response> {
    const route = await import("../notices/route");
    return route[method](req("/api/support/notices", method, token, body));
  }

  it("turns away a caller with no session", async () => {
    expect((await call("GET", null)).status).toBe(401);
    expect((await call("POST", null, { body: "x", hours: 2 })).status).toBe(401);
    expect((await call("DELETE", null)).status).toBe(401);
    expect(dbCalls).toHaveLength(0);
  });

  it("reads only a notice that is still running", async () => {
    dbResult = { data: NOTICE, error: null };
    const res = await call("GET", "support");
    expect(await res.json()).toEqual({ notice: NOTICE });
    expect(dbCalls.find((c) => c.method === "is")?.args).toEqual(["ended_at", null]);
    expect(dbCalls.find((c) => c.method === "gt")?.args[0]).toBe("ends_at");
  });

  it.each([
    ["no body", undefined],
    ["an empty text", { body: "   ", hours: 6 }],
    ["a text over 300 letters", { body: "x".repeat(301), hours: 6 }],
    ["no length", { body: "hi" }],
    ["more than 3 days", { body: "hi", hours: 73 }],
    ["part of an hour", { body: "hi", hours: 1.5 }],
  ])("refuses %s", async (_name, body) => {
    expect((await call("POST", "support", body)).status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("posts as me, whatever the body claims, and logs it", async () => {
    dbQueue.push({ data: { display_name: "Noor", email: null }, error: null }, { data: NOTICE, error: null });
    const res = await call("POST", "support", { body: "  برايم متأخر اليوم ", hours: 6, adminId: "someone" });
    expect(res.status).toBe(200);
    expect((await res.json()).notice).toEqual(NOTICE);
    expect(rpcCall()?.args).toEqual([
      "support_notice_post",
      { p_admin_id: SUPPORT_ID, p_admin_name: "Noor", p_body: "برايم متأخر اليوم", p_hours: 6 },
    ]);
    expect(dbCalls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      admin_user_id: SUPPORT_ID,
      action: "support_notice_posted",
      details: { notice_id: NOTICE.id, hours: 6, body: NOTICE.body },
    });
  });

  it("maps a database refusal to its words", async () => {
    dbQueue.push(
      { data: { display_name: "Noor", email: null }, error: null },
      { data: null, error: { code: "P0001", message: "support_notice_bad_hours" } },
    );
    const res = await call("POST", "support", { body: "hi", hours: 6 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A notice runs for 1 to 72 hours." });
  });

  it("ends the live notice and logs it", async () => {
    dbResult = { data: 1, error: null };
    const res = await call("DELETE", "support");
    expect(await res.json()).toEqual({ ended: 1 });
    expect(rpcCall()?.args).toEqual(["support_notice_end", { p_admin_id: SUPPORT_ID }]);
    expect(dbCalls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      admin_user_id: SUPPORT_ID,
      action: "support_notice_ended",
      details: { ended: 1 },
    });
  });
});
