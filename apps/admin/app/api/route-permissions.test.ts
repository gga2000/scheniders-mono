import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { AdminAction, AdminRole } from "@/types/admin";
import { hasPermission } from "@/lib/admin-permissions";
import { AdminAuthError } from "@/lib/admin-auth-error";

/**
 * The admin middleware only checks "is an active admin" — both roles pass it.
 * Every privileged action therefore has to be enforced by the route itself.
 * These tests call the real handlers with the real `requireAdminPermission` /
 * `hasPermission`; only the Supabase layer (identity lookup + service-role
 * client) is faked.
 */

const SUPER_ID = "11111111-1111-4111-8111-111111111111";
const SUPPORT_ID = "22222222-2222-4222-8222-222222222222";
const TENANT = "33333333-3333-4333-8333-333333333333";
/** The id the browser makes for one staff ask (lib/request-ids.ts). */
const REQ = "44444444-4444-4444-8444-444444444444";

const IDENTITIES: Record<string, { user: { id: string; email: string }; role: AdminRole }> = {
  super: { user: { id: SUPER_ID, email: "boss@example.com" }, role: "super_admin" },
  support: { user: { id: SUPPORT_ID, email: "agent@example.com" }, role: "support_staff" },
};

type DbResult = { data: unknown; error: { code: string; message: string } | null };
type DbCall = { method: string; args: unknown[] };

const dbCalls: DbCall[] = [];
let dbResult: DbResult;
/** Per-await answers, consumed in order; `dbResult` answers once it is empty. */
const dbQueue: DbResult[] = [];

/** A PostgREST-shaped builder: every method chains, awaiting yields `dbResult`. */
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

const createAdminClient = vi.fn(() => fakeQuery());

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient,
  requireAdmin: vi.fn(async (token: string) => {
    const identity = IDENTITIES[token];
    if (!identity) throw new AdminAuthError(401, "Invalid access token");
    return identity;
  }),
  resolveAdminRole: vi.fn(),
}));

// Cookie transport: no session, so a request without a bearer token is anonymous.
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

beforeEach(() => {
  // The fake DB answers "not found"; handlers log that before returning 4xx/5xx.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  dbCalls.length = 0;
  dbQueue.length = 0;
  createAdminClient.mockClear();
  dbResult = { data: null, error: { code: "PGRST116", message: "not found" } };
});

function req(
  pathname: string,
  method: string,
  token: string | null,
  body?: unknown,
): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest(`http://admin.test${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const idParams = { params: Promise.resolve({ id: TENANT }) };
const LEAD = "44444444-4444-4444-8444-444444444444";
const leadParams = { params: Promise.resolve({ id: LEAD }) };

type Case = {
  name: string;
  call: (token: string | null) => Promise<Response>;
};

/** Mutations support_staff must NOT be able to perform. */
const SUPER_ADMIN_ONLY: Case[] = [
  {
    name: "GET /api/export?type=transactions (adjust_balance)",
    call: async (t) => {
      const { GET } = await import("./export/route");
      return GET(req("/api/export?type=transactions&format=csv", "GET", t));
    },
  },
  {
    name: "PUT /api/settings/payment-details (update_settings)",
    call: async (t) => {
      const { PUT } = await import("./settings/payment-details/route");
      return PUT(
        req("/api/settings/payment-details", "PUT", t, {
          qi_card: "1234",
          qi_card_name: "Fermi",
          zain_cash: "",
          support_whatsapp: "9647701234567",
          working_hours: "10-6",
          legal_name: "Fermi",
        }),
      );
    },
  },
  {
    name: "POST /api/billing/topup (top_up_wallet)",
    call: async (t) => {
      const { POST } = await import("./billing/topup/route");
      return POST(
        req("/api/billing/topup", "POST", t, {
          tenant_id: TENANT,
          amount: 5000,
          request_id: "55555555-5555-4555-8555-555555555555",
        }),
      );
    },
  },
  {
    name: "POST /api/merchants/[id]/pause (suspend_tenant)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/pause/route");
      return POST(req(`/api/merchants/${TENANT}/pause`, "POST", t, { duration_days: 7 }), idParams);
    },
  },
  {
    name: "POST /api/merchants/[id]/unpause (reactivate_tenant)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/unpause/route");
      return POST(req(`/api/merchants/${TENANT}/unpause`, "POST", t), idParams);
    },
  },
  {
    name: "GET /api/demo-store (manage_demo_store)",
    call: async (t) => {
      const { GET } = await import("./demo-store/route");
      return GET(req("/api/demo-store", "GET", t));
    },
  },
  {
    name: "POST /api/demo-store reset (manage_demo_store)",
    call: async (t) => {
      const { POST } = await import("./demo-store/route");
      return POST(req("/api/demo-store", "POST", t, { action: "reset" }));
    },
  },
  {
    name: "POST /api/merchants/[id]/whatsapp-pause (pause_whatsapp)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/whatsapp-pause/route");
      return POST(req(`/api/merchants/${TENANT}/whatsapp-pause`, "POST", t, { paused: true }), idParams);
    },
  },
  {
    name: "POST /api/merchants/[id]/extend-subscription (manage_subscription)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/extend-subscription/route");
      return POST(
        req(`/api/merchants/${TENANT}/extend-subscription`, "POST", t, { days: 30, request_id: REQ }),
        idParams,
      );
    },
  },
  {
    name: "POST /api/merchants/[id]/force-unlock (manage_subscription)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/force-unlock/route");
      return POST(
        req(`/api/merchants/${TENANT}/force-unlock`, "POST", t, { days: 30, reason: "paid in cash", request_id: REQ }),
        idParams,
      );
    },
  },
  {
    name: "POST /api/merchants/[id]/convert-trial (manage_subscription)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/convert-trial/route");
      return POST(
        req(`/api/merchants/${TENANT}/convert-trial`, "POST", t, { period_days: 30 }),
        idParams,
      );
    },
  },
  {
    name: "POST /api/team/commissions (manage_commissions)",
    call: async (t) => {
      const { POST } = await import("./team/commissions/route");
      return POST(req("/api/team/commissions", "POST", t, { name: "x", type: "per_order" }));
    },
  },
  {
    name: "POST /api/team/commissions/calculate (manage_commissions)",
    call: async (t) => {
      const { POST } = await import("./team/commissions/calculate/route");
      return POST(
        req("/api/team/commissions/calculate", "POST", t, {
          period_start: "2026-10-01",
          period_end: "2026-10-31",
        }),
      );
    },
  },
  {
    name: "DELETE /api/leads/[id] (delete_leads)",
    call: async (t) => {
      const { DELETE } = await import("./leads/[id]/route");
      return DELETE(req(`/api/leads/${LEAD}`, "DELETE", t), leadParams);
    },
  },
  {
    name: "POST /api/leads/bulk delete (delete_leads)",
    call: async (t) => {
      const { POST } = await import("./leads/bulk/route");
      return POST(req("/api/leads/bulk", "POST", t, { lead_ids: [LEAD], action: "delete" }));
    },
  },
  {
    name: "POST /api/industries (update_settings)",
    call: async (t) => {
      const { POST } = await import("./industries/route");
      return POST(req("/api/industries", "POST", t, { name: "Perfume" }));
    },
  },
  {
    name: "PATCH /api/industries/[id] (update_settings)",
    call: async (t) => {
      const { PATCH } = await import("./industries/[id]/route");
      return PATCH(req(`/api/industries/${TENANT}`, "PATCH", t, { is_active: false }), idParams);
    },
  },
  {
    name: "DELETE /api/industries/[id] (update_settings)",
    call: async (t) => {
      const { DELETE } = await import("./industries/[id]/route");
      return DELETE(req(`/api/industries/${TENANT}`, "DELETE", t), idParams);
    },
  },
];

/** Handlers both roles may use (reads, and actions support_staff holds). */
const ANY_ADMIN: Case[] = [
  {
    name: "POST /api/wallet-topup-requests/[id] approve (check_payments)",
    call: async (t) => {
      const { POST } = await import("./wallet-topup-requests/[id]/route");
      return POST(req(`/api/wallet-topup-requests/${TENANT}`, "POST", t, { approve: true, amount: 9000 }), idParams);
    },
  },
  {
    name: "POST /api/wallet-topup-requests/[id] refuse (check_payments)",
    call: async (t) => {
      const { POST } = await import("./wallet-topup-requests/[id]/route");
      return POST(
        req(`/api/wallet-topup-requests/${TENANT}`, "POST", t, { approve: false, reason: "Receipt is blurry" }),
        idParams,
      );
    },
  },
  {
    name: "GET /api/wallet-topup-requests",
    call: async (t) => {
      const { GET } = await import("./wallet-topup-requests/route");
      return GET(req("/api/wallet-topup-requests", "GET", t));
    },
  },
  {
    name: "GET /api/settings/payment-details",
    call: async (t) => {
      const { GET } = await import("./settings/payment-details/route");
      return GET(req("/api/settings/payment-details", "GET", t));
    },
  },
  {
    name: "POST /api/merchants/[id]/extend-trial (extend_trial)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/extend-trial/route");
      return POST(
        req(`/api/merchants/${TENANT}/extend-trial`, "POST", t, { days: 7, reason: "customer asked", request_id: REQ }),
        idParams,
      );
    },
  },
  {
    name: "GET /api/trial-checks",
    call: async (t) => {
      const { GET } = await import("./trial-checks/route");
      return GET(req("/api/trial-checks", "GET", t));
    },
  },
  {
    name: "POST /api/trial-checks/[id] (review_trials)",
    call: async (t) => {
      const { POST } = await import("./trial-checks/[id]/route");
      return POST(
        req(`/api/trial-checks/${TENANT}`, "POST", t, { decision: "allow_trial", days: 7, reason: "same owner, new brand" }),
        idParams,
      );
    },
  },
  {
    name: "POST /api/trials/extend (extend_trial)",
    call: async (t) => {
      const { POST } = await import("./trials/extend/route");
      return POST(req("/api/trials/extend", "POST", t, { tenant_id: TENANT, days: 7, reason: "customer asked", request_id: REQ }));
    },
  },
  {
    name: "POST /api/merchants/[id]/lock-orders (extend_trial)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/lock-orders/route");
      return POST(
        req(`/api/merchants/${TENANT}/lock-orders`, "POST", t, { orders: 10, reason: "courier delay", request_id: REQ }),
        idParams,
      );
    },
  },
  {
    name: "POST /api/leads/[id]/build-store (convert_lead)",
    call: async (t) => {
      const { POST } = await import("./leads/[id]/build-store/route");
      return POST(req(`/api/leads/${LEAD}/build-store`, "POST", t, {}), leadParams);
    },
  },
  {
    name: "POST /api/leads/bulk change_priority (any admin)",
    call: async (t) => {
      const { POST } = await import("./leads/bulk/route");
      return POST(
        req("/api/leads/bulk", "POST", t, { lead_ids: [LEAD], action: "change_priority", payload: { priority: "high" } }),
      );
    },
  },
  {
    name: "POST /api/leads/[id]/convert (convert_lead)",
    call: async (t) => {
      const { POST } = await import("./leads/[id]/convert/route");
      return POST(req(`/api/leads/${LEAD}/convert`, "POST", t, {}), leadParams);
    },
  },
  {
    name: "POST /api/merchants/[id]/notes (add_note)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/notes/route");
      return POST(req(`/api/merchants/${TENANT}/notes`, "POST", t, { content: "hi" }), idParams);
    },
  },
  {
    name: "GET /api/merchants/[id]/notes",
    call: async (t) => {
      const { GET } = await import("./merchants/[id]/notes/route");
      return GET(req(`/api/merchants/${TENANT}/notes`, "GET", t), idParams);
    },
  },
  {
    name: "GET /api/merchants/[id]/orders",
    call: async (t) => {
      const { GET } = await import("./merchants/[id]/orders/route");
      return GET(req(`/api/merchants/${TENANT}/orders`, "GET", t), idParams);
    },
  },
  {
    name: "GET /api/merchants/[id]/timeline",
    call: async (t) => {
      const { GET } = await import("./merchants/[id]/timeline/route");
      return GET(req(`/api/merchants/${TENANT}/timeline`, "GET", t), idParams);
    },
  },
];

describe("super_admin-only mutations", () => {
  it.each(SUPER_ADMIN_ONLY)("$name — support_staff gets 403 and touches no data", async ({ call }) => {
    const res = await call("support");
    expect(res.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(SUPER_ADMIN_ONLY)("$name — super_admin passes the guard", async ({ call }) => {
    const res = await call("super");
    expect([401, 403]).not.toContain(res.status);
    expect(createAdminClient).toHaveBeenCalled();
  });

  it.each(SUPER_ADMIN_ONLY)("$name — anonymous gets 401", async ({ call }) => {
    const res = await call(null);
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("handlers open to every active admin", () => {
  it.each(ANY_ADMIN)("$name — support_staff passes the guard", async ({ call }) => {
    const res = await call("support");
    expect([401, 403]).not.toContain(res.status);
    expect(createAdminClient).toHaveBeenCalled();
  });

  it.each(ANY_ADMIN)("$name — super_admin passes the guard", async ({ call }) => {
    const res = await call("super");
    expect([401, 403]).not.toContain(res.status);
  });

  it.each(ANY_ADMIN)("$name — anonymous gets 401", async ({ call }) => {
    const res = await call(null);
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("actor attribution", () => {
  it("a new note is attributed to the admin who wrote it, not 'system'", async () => {
    dbResult = { data: { id: "n1" }, error: null };
    const { POST } = await import("./merchants/[id]/notes/route");
    const res = await POST(
      req(`/api/merchants/${TENANT}/notes`, "POST", "support", { content: "called them" }),
      idParams,
    );

    expect(res.status).toBe(201);
    const insert = dbCalls.find((c) => c.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      tenant_id: TENANT,
      admin_user_id: SUPPORT_ID,
      admin_label: "agent@example.com",
    });
  });
});

/**
 * `extend_trial` is a support_staff permission. It must only move the trial
 * clock of a tenant that is on trial, never write `status`, or a support agent
 * could lift a pause (`limited`) or suspension that needs `reactivate_tenant`.
 * The check and the write live in the `admin_extend_trial` SQL function (its
 * behaviour is proven in packages/supabase/tests/behaviour/billing-lock.test.sql,
 * sections 15 and 18); the routes must go through it and nothing else.
 */
describe("trial extension goes through admin_extend_trial only", () => {
  const ROUTES: Case[] = [
    {
      name: "POST /api/merchants/[id]/extend-trial",
      call: async (t) => {
        const { POST } = await import("./merchants/[id]/extend-trial/route");
        return POST(
          req(`/api/merchants/${TENANT}/extend-trial`, "POST", t, { days: 30, reason: "  customer asked  ", request_id: REQ }),
          idParams,
        );
      },
    },
    {
      name: "POST /api/trials/extend",
      call: async (t) => {
        const { POST } = await import("./trials/extend/route");
        return POST(req("/api/trials/extend", "POST", t, { tenant_id: TENANT, days: 30, reason: "  customer asked  ", request_id: REQ }));
      },
    },
  ];

  /** Table access from the route itself: the old read-then-update path. */
  const directTableCalls = () =>
    dbCalls.filter((c) => ["from", "update", "insert", "upsert", "delete"].includes(c.method));

  it.each(ROUTES)(
    "$name: support_staff gets 400 when the database refuses a shop that is not on trial",
    async ({ call }) => {
      dbResult = { data: { success: false, error: "not_trial" }, error: null };
      const res = await call("support");
      expect(res.status).toBe(400);
      expect(directTableCalls()).toEqual([]);
    },
  );

  it.each(ROUTES)("$name: an unknown shop is a 404", async ({ call }) => {
    dbResult = { data: { success: false, error: "not_found" }, error: null };
    const res = await call("support");
    expect(res.status).toBe(404);
  });

  it.each(ROUTES)(
    "$name: a trialing shop is extended by one RPC that names the acting admin",
    async ({ call }) => {
      dbResult = {
        data: { success: true, tenant_id: TENANT, trial_ends_at: "2099-01-31T00:00:00+00:00", subscriptions_moved: 1 },
        error: null,
      };
      const res = await call("support");

      expect(res.status).toBe(200);
      expect(dbCalls.filter((c) => c.method === "rpc").map((c) => c.args)).toEqual([
        [
          "admin_extend_trial_once",
          {
            _request_id: REQ,
            _tenant_id: TENANT,
            _days: 30,
            _reason: "customer asked",
            _admin_user_id: SUPPORT_ID,
            _actor_email: "agent@example.com",
            _source: "single",
          },
        ],
      ]);
      // No tenants.trial_ends_at write from JS: that left the bill date behind.
      expect(directTableCalls()).toEqual([]);
    },
  );

  it.each(ROUTES)("$name: a database error or an unreadable answer is a 500, not a success", async ({ call }) => {
    dbResult = { data: null, error: { code: "40P01", message: "deadlock detected" } };
    expect((await call("support")).status).toBe(500);

    dbResult = { data: { success: true }, error: null };
    expect((await call("support")).status).toBe(500);
  });

  it("caps a single extension at 90 days on both routes", async () => {
    const { POST: perMerchant } = await import("./merchants/[id]/extend-trial/route");
    const { POST: trials } = await import("./trials/extend/route");

    const a = await perMerchant(
      req(`/api/merchants/${TENANT}/extend-trial`, "POST", "super", { days: 91, reason: "customer asked", request_id: REQ }),
      idParams,
    );
    const b = await trials(
      req("/api/trials/extend", "POST", "super", { tenant_id: TENANT, days: 91, reason: "customer asked", request_id: REQ }),
    );
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   ", "ok", "x".repeat(501)])(
    "needs a reason of 3 to 500 characters on both routes (%s)",
    async (reason) => {
      const { POST: perMerchant } = await import("./merchants/[id]/extend-trial/route");
      const { POST: trials } = await import("./trials/extend/route");

      const a = await perMerchant(
        req(`/api/merchants/${TENANT}/extend-trial`, "POST", "support", { days: 7, reason, request_id: REQ }),
        idParams,
      );
      const b = await trials(req("/api/trials/extend", "POST", "support", { tenant_id: TENANT, days: 7, reason, request_id: REQ }));
      expect(a.status).toBe(400);
      expect(b.status).toBe(400);
      expect(createAdminClient).not.toHaveBeenCalled();
    },
  );
});

/**
 * The billing lock's staff tools (Fermi A1): more storefront orders for a
 * locked store (support staff too) and a free unlock (super admin only: it
 * grants paid time without a payment). Each is one SQL function that checks
 * the lock, writes the change and logs the reason with the acting admin.
 */
describe("billing lock staff tools", () => {
  const lockOrders = async (t: string, body: unknown) => {
    const { POST } = await import("./merchants/[id]/lock-orders/route");
    return POST(req(`/api/merchants/${TENANT}/lock-orders`, "POST", t, body), idParams);
  };
  const forceUnlock = async (t: string, body: unknown) => {
    const { POST } = await import("./merchants/[id]/force-unlock/route");
    return POST(req(`/api/merchants/${TENANT}/force-unlock`, "POST", t, body), idParams);
  };
  const rpcCalls = () => dbCalls.filter((c) => c.method === "rpc").map((c) => c.args);
  const tableCalls = () =>
    dbCalls.filter((c) => ["from", "update", "insert", "upsert", "delete"].includes(c.method));

  it("gives a locked store more orders through one RPC that names the admin and the reason", async () => {
    dbResult = { data: { success: true, tenant_id: TENANT, orders_left: 12 }, error: null };
    const res = await lockOrders("support", { orders: 10, reason: " courier delay ", request_id: REQ });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: TENANT, orders_left: 12, repeat: false });
    expect(rpcCalls()).toEqual([
      [
        "admin_add_lock_orders_once",
        {
          _request_id: REQ,
          _tenant_id: TENANT,
          _orders: 10,
          _reason: "courier delay",
          _admin_user_id: SUPPORT_ID,
          _actor_email: "agent@example.com",
          _may_grant_unpaid: false,
        },
      ],
    ]);
    expect(tableCalls()).toEqual([]);
  });

  it("lets only a super admin give orders to a store locked for an unpaid month", async () => {
    dbResult = { data: { success: false, error: "unpaid_lock" }, error: null };
    const refused = await lockOrders("support", { orders: 1000, reason: "keeps selling", request_id: REQ });
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toMatch(/super admin/);
    expect(rpcCalls().at(-1)?.[1]).toMatchObject({ _may_grant_unpaid: false });

    dbResult = { data: { success: true, tenant_id: TENANT, orders_left: 1010 }, error: null };
    expect((await lockOrders("super", { orders: 1000, reason: "paid in cash, bank slow", request_id: REQ })).status).toBe(200);
    expect(rpcCalls().at(-1)?.[1]).toMatchObject({ _may_grant_unpaid: true });
  });

  it("unlocks a store for free through one RPC that names the admin and the reason", async () => {
    dbResult = {
      data: { success: true, tenant_id: TENANT, period_end: "2099-01-31T00:00:00+00:00", lock_reason: "unpaid" },
      error: null,
    };
    const res = await forceUnlock("super", { days: 30, reason: "paid in cash", request_id: REQ });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "active", period_end: "2099-01-31T00:00:00+00:00" });
    expect(rpcCalls()).toEqual([
      [
        "admin_force_unlock_once",
        {
          _request_id: REQ,
          _tenant_id: TENANT,
          _days: 30,
          _reason: "paid in cash",
          _admin_user_id: SUPER_ID,
          _actor_email: "boss@example.com",
        },
      ],
    ]);
    expect(tableCalls()).toEqual([]);
  });

  it("a store that is not locked is a 409, an unknown one a 404", async () => {
    dbResult = { data: { success: false, error: "not_locked" }, error: null };
    expect((await lockOrders("support", { orders: 10, reason: "courier delay", request_id: REQ })).status).toBe(409);
    expect((await forceUnlock("super", { days: 30, reason: "paid in cash", request_id: REQ })).status).toBe(409);

    dbResult = { data: { success: false, error: "not_found" }, error: null };
    expect((await lockOrders("support", { orders: 10, reason: "courier delay", request_id: REQ })).status).toBe(404);
    expect((await forceUnlock("super", { days: 30, reason: "paid in cash", request_id: REQ })).status).toBe(404);
  });

  it("a database error or an unreadable answer is a 500, not a success", async () => {
    dbResult = { data: null, error: { code: "40P01", message: "deadlock detected" } };
    expect((await lockOrders("support", { orders: 10, reason: "courier delay", request_id: REQ })).status).toBe(500);
    expect((await forceUnlock("super", { days: 30, reason: "paid in cash", request_id: REQ })).status).toBe(500);

    dbResult = { data: { success: true }, error: null };
    expect((await lockOrders("support", { orders: 10, reason: "courier delay", request_id: REQ })).status).toBe(500);
    expect((await forceUnlock("super", { days: 30, reason: "paid in cash", request_id: REQ })).status).toBe(500);
  });

  it.each([
    ["no reason", { orders: 10, request_id: REQ }, { days: 30, request_id: REQ }],
    ["a short reason", { orders: 10, reason: "ok", request_id: REQ }, { days: 30, reason: "ok", request_id: REQ }],
    ["zero", { orders: 0, reason: "courier delay", request_id: REQ }, { days: 0, reason: "paid in cash", request_id: REQ }],
    ["over the cap", { orders: 1001, reason: "courier delay", request_id: REQ }, { days: 91, reason: "paid in cash", request_id: REQ }],
    ["a fraction", { orders: 2.5, reason: "courier delay", request_id: REQ }, { days: 1.5, reason: "paid in cash", request_id: REQ }],
  ])("refuses %s before touching the database", async (_label, ordersBody, unlockBody) => {
    expect((await lockOrders("support", ordersBody)).status).toBe(400);
    expect((await forceUnlock("super", unlockBody)).status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

/**
 * Free days, more lock orders and a free unlock happen once per staff ask
 * (audit N3): every route needs the request id the browser made, sends it to
 * the database's *_once function, and passes a repeat or a reused id back.
 * The once-only rule itself is proven in
 * packages/supabase/tests/behaviour/staff-action-once.test.sql.
 */
describe("one change per staff request", () => {
  const CALLS = [
    {
      name: "extend-trial",
      role: "support",
      body: { days: 7, reason: "customer asked" },
      ok: { success: true, tenant_id: TENANT, trial_ends_at: "2099-01-31T00:00:00+00:00" },
      call: async (t: string, body: unknown) => {
        const { POST } = await import("./merchants/[id]/extend-trial/route");
        return POST(req(`/api/merchants/${TENANT}/extend-trial`, "POST", t, body), idParams);
      },
    },
    {
      name: "trials/extend",
      role: "support",
      body: { tenant_id: TENANT, days: 7, reason: "customer asked" },
      ok: { success: true, tenant_id: TENANT, trial_ends_at: "2099-01-31T00:00:00+00:00" },
      call: async (t: string, body: unknown) => {
        const { POST } = await import("./trials/extend/route");
        return POST(req("/api/trials/extend", "POST", t, body));
      },
    },
    {
      name: "extend-subscription",
      role: "super",
      body: { days: 30 },
      ok: { success: true, tenant_id: TENANT, current_period_end: "2099-01-31T00:00:00+00:00", status: "active" },
      call: async (t: string, body: unknown) => {
        const { POST } = await import("./merchants/[id]/extend-subscription/route");
        return POST(req(`/api/merchants/${TENANT}/extend-subscription`, "POST", t, body), idParams);
      },
    },
    {
      name: "lock-orders",
      role: "support",
      body: { orders: 10, reason: "courier delay" },
      ok: { success: true, tenant_id: TENANT, orders_left: 12 },
      call: async (t: string, body: unknown) => {
        const { POST } = await import("./merchants/[id]/lock-orders/route");
        return POST(req(`/api/merchants/${TENANT}/lock-orders`, "POST", t, body), idParams);
      },
    },
    {
      name: "force-unlock",
      role: "super",
      body: { days: 30, reason: "paid in cash" },
      ok: { success: true, tenant_id: TENANT, period_end: "2099-01-31T00:00:00+00:00", lock_reason: "unpaid" },
      call: async (t: string, body: unknown) => {
        const { POST } = await import("./merchants/[id]/force-unlock/route");
        return POST(req(`/api/merchants/${TENANT}/force-unlock`, "POST", t, body), idParams);
      },
    },
  ];

  it.each(CALLS)("$name: a page with no request id is asked to reload, before the database", async (c) => {
    for (const bad of [undefined, "", "not-a-uuid"]) {
      const res = await c.call(c.role, { ...c.body, request_id: bad });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/Reload/);
    }
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(CALLS)("$name: sends the request id to the once-only database function", async (c) => {
    dbResult = { data: c.ok, error: null };
    const res = await c.call(c.role, { ...c.body, request_id: REQ });
    expect(res.status).toBe(200);
    expect((await res.json()).repeat).toBe(false);
    const rpcs = dbCalls.filter((d) => d.method === "rpc").map((d) => d.args);
    expect(rpcs).toHaveLength(1);
    expect(String(rpcs[0]?.[0])).toMatch(/_once$/);
    expect(rpcs[0]?.[1]).toMatchObject({ _request_id: REQ, _tenant_id: TENANT });
  });

  it.each(CALLS)("$name: a repeat answers 200 with the first result, marked repeat", async (c) => {
    dbResult = { data: { ...c.ok, repeat: true }, error: null };
    const res = await c.call(c.role, { ...c.body, request_id: REQ });
    expect(res.status).toBe(200);
    expect((await res.json()).repeat).toBe(true);
  });

  it.each(CALLS)("$name: an id the database saw for another change is a 409", async (c) => {
    dbResult = { data: { success: false, error: "request_reused" }, error: null };
    const res = await c.call(c.role, { ...c.body, request_id: REQ });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already used/);
  });
});

describe("pause attribution", () => {
  it("stores the admin's uuid in tenants.restrictions.paused_by, never the email", async () => {
    // The pause is written by the database function pause_tenant, which answers with the shop's row.
    dbResult = { data: [{ id: TENANT, status: "limited", restrictions: {} }], error: null };
    const { POST } = await import("./merchants/[id]/pause/route");
    const res = await POST(
      req(`/api/merchants/${TENANT}/pause`, "POST", "super", { duration_days: 7 }),
      idParams,
    );

    expect(res.status).toBe(200);
    const pause = dbCalls.find((c) => c.method === "rpc");
    expect(pause?.args[0]).toBe("pause_tenant");
    const sent = pause?.args[1] as { _tenant_id: string; _restrictions: { paused_by: string } };
    expect(sent._tenant_id).toBe(TENANT);
    expect(sent._restrictions.paused_by).toBe(SUPER_ID);
    expect(JSON.stringify(sent)).not.toContain("boss@example.com");
  });
});

/**
 * Structural net: a new route handler that forgets its guard fails here, not in
 * production. Each exported handler body must call one of the guards.
 */
describe("every admin API handler is guarded", () => {
  const API_DIR = path.resolve(__dirname);
  // Routes never call `requireAdmin` directly: its typed AdminAuthError would
  // land in the handler's generic catch and come back as a 500.
  const GUARD = /\b(requireAdminPermission|requireAdminFromRequest|requireBearerAdmin)\(/;
  // The OAuth callback runs before a session exists; middleware also exempts it.
  const PUBLIC = new Set(["auth/callback/route.ts GET"]);

  const routeFiles = readdirSync(API_DIR, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(`${path.sep}route.ts`) || f === "route.ts")
    .map((f) => f.split(path.sep).join("/"))
    .sort();

  const handlers = routeFiles.flatMap((file) => {
    const src = readFileSync(path.join(API_DIR, file), "utf8");
    const parts = src.split(/export async function (GET|POST|PUT|PATCH|DELETE)\b/);
    const found: { key: string; body: string }[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      found.push({ key: `${file} ${parts[i]}`, body: parts[i + 1] ?? "" });
    }
    return found;
  });

  it("finds the handlers", () => {
    expect(handlers.length).toBeGreaterThan(50);
  });

  it.each(handlers.filter((h) => !PUBLIC.has(h.key)).map((h) => [h.key, h.body]))(
    "%s calls a guard",
    (_key, body) => {
      expect(body).toMatch(GUARD);
      expect(body).not.toMatch(/\brequireAdmin\(/);
    },
  );
});

/**
 * Every role rule, proven from the source, so no list has to be kept by hand.
 *
 * - A handler that names a permission the support role does not hold is
 *   called as support staff (403, no data touched) and with no login (401),
 *   whatever its path or body: the guard has to come first.
 * - A write that only checks "is an admin" must be listed in OPEN_WRITES with
 *   the reason support staff may do it. A new write cannot fall open quietly.
 * - A route never compares the role by hand: the permission table is the
 *   only rule, so this test sees every rule there is.
 */
describe("every role rule is proven from the source", () => {
  const API_DIR = path.resolve(__dirname);
  type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  type Handler = { file: string; method: Method; body: string; permission: AdminAction | null };

  const handlers: Handler[] = readdirSync(API_DIR, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(`${path.sep}route.ts`) || f === "route.ts")
    .map((f) => f.split(path.sep).join("/"))
    .sort()
    .flatMap((file) => {
      const parts = readFileSync(path.join(API_DIR, file), "utf8").split(
        /export async function (GET|POST|PUT|PATCH|DELETE)\b/,
      );
      const found: Handler[] = [];
      for (let i = 1; i < parts.length; i += 2) {
        const body = parts[i + 1] ?? "";
        const named = body.match(/requireAdminPermission\(\s*\w+\s*,\s*"(\w+)"/);
        found.push({
          file,
          method: parts[i] as Method,
          body,
          permission: named ? (named[1] as AdminAction) : null,
        });
      }
      return found;
    });
  const key = (h: Handler) => `${h.file} ${h.method}`;

  /** Writes open to every active admin, each with the reason. */
  const OPEN_WRITES: Record<string, string> = {
    "leads/route.ts POST": "sales work: add a lead",
    "leads/import/route.ts POST": "sales work: import leads",
    "leads/bulk/route.ts POST": "sales work; delete needs delete_leads, checked in the handler",
    "leads/analyze-profile/route.ts POST": "reads a lead's public profile",
    "leads/[id]/route.ts PATCH": "sales work: edit a lead",
    "leads/[id]/activities/route.ts POST": "sales work: log a call or message",
    "leads/[id]/competitors/route.ts POST": "sales work: note a competitor",
    "leads/[id]/competitors/route.ts DELETE": "sales work: remove a competitor note",
    "leads/[id]/follow-ups/route.ts POST": "sales work: plan a follow-up",
    "leads/[id]/follow-ups/[fid]/route.ts PATCH": "sales work: mark a follow-up done",
  };

  const superOnly = handlers.filter(
    (h) => h.permission !== null && !hasPermission("support_staff", h.permission),
  );

  /** The URL of a handler's file, with every [param] filled in. */
  const urlOf = (file: string) =>
    `/api/${file.replace(/\/?route\.ts$/, "").replace(/\[[^\]]+\]/g, TENANT)}`;
  /** Any route param (`id`, `tenantId`, `fid`) reads as the test id. */
  const anyParams = { params: Promise.resolve(new Proxy({}, { get: () => TENANT })) };

  async function callAs(h: Handler, token: string | null): Promise<Response> {
    const mod = (await import(`./${h.file.replace(/\.ts$/, "")}`)) as Record<
      string,
      (request: NextRequest, context: typeof anyParams) => Promise<Response>
    >;
    const handler = mod[h.method];
    if (!handler) throw new Error(`${key(h)} is not exported`);
    return handler(req(urlOf(h.file), h.method, token, h.method === "GET" ? undefined : {}), anyParams);
  }

  it("finds the super-admin-only handlers, the shop change and admin access among them", () => {
    const keys = superOnly.map(key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "merchants/[id]/route.ts PATCH",
        "admin-users/route.ts POST",
        "admin-users/route.ts DELETE",
        "billing/route.ts GET",
        "admin/leads-table-layout/route.ts PUT",
        "billing/topup/route.ts POST",
      ]),
    );
  });

  it.each(superOnly.map((h) => [key(h), h] as const))(
    "%s: support staff get 403 and touch no data",
    async (_name, h) => {
      const res = await callAs(h, "support");
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: "Your login cannot do this. Ask a super admin.",
        permission: h.permission,
      });
      expect(createAdminClient).not.toHaveBeenCalled();
    },
  );

  it.each(superOnly.map((h) => [key(h), h] as const))("%s: no login gets 401", async (_name, h) => {
    const res = await callAs(h, null);
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(
    handlers
      .filter((h) => h.method !== "GET" && h.permission === null)
      .map((h) => [key(h)] as const),
  )("%s: a write with no named permission is listed as open, with a reason", (name) => {
    expect(OPEN_WRITES[name], `${name} checks only "is an admin": name its permission, or list why support may do it`).toBeTruthy();
  });

  it("lists no open write that is gone or now names a permission", () => {
    const openNow = new Set(handlers.filter((h) => h.method !== "GET" && h.permission === null).map(key));
    expect(Object.keys(OPEN_WRITES).filter((name) => !openNow.has(name))).toEqual([]);
  });

  it.each(handlers.map((h) => [key(h), h.body] as const))(
    "%s: compares no role by hand",
    (_name, body) => {
      expect(body).not.toMatch(/\.role\s*[!=]==/);
    },
  );
});
