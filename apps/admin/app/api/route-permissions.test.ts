import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { AdminRole } from "@/types/admin";
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
        req(`/api/merchants/${TENANT}/extend-subscription`, "POST", t, { days: 30 }),
        idParams,
      );
    },
  },
  {
    name: "POST /api/merchants/[id]/force-unlock (manage_subscription)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/force-unlock/route");
      return POST(
        req(`/api/merchants/${TENANT}/force-unlock`, "POST", t, { days: 30, reason: "paid in cash" }),
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
        req(`/api/merchants/${TENANT}/extend-trial`, "POST", t, { days: 7, reason: "customer asked" }),
        idParams,
      );
    },
  },
  {
    name: "POST /api/trials/extend (extend_trial)",
    call: async (t) => {
      const { POST } = await import("./trials/extend/route");
      return POST(req("/api/trials/extend", "POST", t, { tenant_id: TENANT, days: 7, reason: "customer asked" }));
    },
  },
  {
    name: "POST /api/merchants/[id]/lock-orders (extend_trial)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/lock-orders/route");
      return POST(
        req(`/api/merchants/${TENANT}/lock-orders`, "POST", t, { orders: 10, reason: "courier delay" }),
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
    name: "PUT /api/merchants/[id]/tags (manage_tags)",
    call: async (t) => {
      const { PUT } = await import("./merchants/[id]/tags/route");
      return PUT(req(`/api/merchants/${TENANT}/tags`, "PUT", t, { tags: ["vip"] }), idParams);
    },
  },
  {
    name: "GET /api/merchants/[id]/tags",
    call: async (t) => {
      const { GET } = await import("./merchants/[id]/tags/route");
      return GET(req(`/api/merchants/${TENANT}/tags`, "GET", t), idParams);
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
    name: "GET /api/merchants/[id]/audit-log",
    call: async (t) => {
      const { GET } = await import("./merchants/[id]/audit-log/route");
      return GET(req(`/api/merchants/${TENANT}/audit-log`, "GET", t), idParams);
    },
  },
  {
    name: "DELETE /api/admin/watchlist/[tenantId]",
    call: async (t) => {
      const { DELETE } = await import("./admin/watchlist/[tenantId]/route");
      return DELETE(req(`/api/admin/watchlist/${TENANT}`, "DELETE", t), {
        params: Promise.resolve({ tenantId: TENANT }),
      });
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
  it("watchlist DELETE removes only the caller's own entry", async () => {
    dbResult = { data: null, error: null };
    const { DELETE } = await import("./admin/watchlist/[tenantId]/route");
    const res = await DELETE(req(`/api/admin/watchlist/${TENANT}`, "DELETE", "support"), {
      params: Promise.resolve({ tenantId: TENANT }),
    });

    expect(res.status).toBe(200);
    const eqs = dbCalls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["admin_user_id", SUPPORT_ID]);
    expect(eqs).toContainEqual(["tenant_id", TENANT]);
  });

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
          req(`/api/merchants/${TENANT}/extend-trial`, "POST", t, { days: 30, reason: "  customer asked  " }),
          idParams,
        );
      },
    },
    {
      name: "POST /api/trials/extend",
      call: async (t) => {
        const { POST } = await import("./trials/extend/route");
        return POST(req("/api/trials/extend", "POST", t, { tenant_id: TENANT, days: 30, reason: "  customer asked  " }));
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
          "admin_extend_trial",
          {
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
      req(`/api/merchants/${TENANT}/extend-trial`, "POST", "super", { days: 91, reason: "customer asked" }),
      idParams,
    );
    const b = await trials(
      req("/api/trials/extend", "POST", "super", { tenant_id: TENANT, days: 91, reason: "customer asked" }),
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
        req(`/api/merchants/${TENANT}/extend-trial`, "POST", "support", { days: 7, reason }),
        idParams,
      );
      const b = await trials(req("/api/trials/extend", "POST", "support", { tenant_id: TENANT, days: 7, reason }));
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
    const res = await lockOrders("support", { orders: 10, reason: " courier delay " });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: TENANT, orders_left: 12 });
    expect(rpcCalls()).toEqual([
      [
        "admin_add_lock_orders",
        {
          _tenant_id: TENANT,
          _orders: 10,
          _reason: "courier delay",
          _admin_user_id: SUPPORT_ID,
          _actor_email: "agent@example.com",
        },
      ],
    ]);
    expect(tableCalls()).toEqual([]);
  });

  it("unlocks a store for free through one RPC that names the admin and the reason", async () => {
    dbResult = {
      data: { success: true, tenant_id: TENANT, period_end: "2099-01-31T00:00:00+00:00", lock_reason: "unpaid" },
      error: null,
    };
    const res = await forceUnlock("super", { days: 30, reason: "paid in cash" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "active", period_end: "2099-01-31T00:00:00+00:00" });
    expect(rpcCalls()).toEqual([
      [
        "admin_force_unlock",
        {
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
    expect((await lockOrders("support", { orders: 10, reason: "courier delay" })).status).toBe(409);
    expect((await forceUnlock("super", { days: 30, reason: "paid in cash" })).status).toBe(409);

    dbResult = { data: { success: false, error: "not_found" }, error: null };
    expect((await lockOrders("support", { orders: 10, reason: "courier delay" })).status).toBe(404);
    expect((await forceUnlock("super", { days: 30, reason: "paid in cash" })).status).toBe(404);
  });

  it("a database error or an unreadable answer is a 500, not a success", async () => {
    dbResult = { data: null, error: { code: "40P01", message: "deadlock detected" } };
    expect((await lockOrders("support", { orders: 10, reason: "courier delay" })).status).toBe(500);
    expect((await forceUnlock("super", { days: 30, reason: "paid in cash" })).status).toBe(500);

    dbResult = { data: { success: true }, error: null };
    expect((await lockOrders("support", { orders: 10, reason: "courier delay" })).status).toBe(500);
    expect((await forceUnlock("super", { days: 30, reason: "paid in cash" })).status).toBe(500);
  });

  it.each([
    ["no reason", { orders: 10 }, { days: 30 }],
    ["a short reason", { orders: 10, reason: "ok" }, { days: 30, reason: "ok" }],
    ["zero", { orders: 0, reason: "courier delay" }, { days: 0, reason: "paid in cash" }],
    ["over the cap", { orders: 1001, reason: "courier delay" }, { days: 91, reason: "paid in cash" }],
    ["a fraction", { orders: 2.5, reason: "courier delay" }, { days: 1.5, reason: "paid in cash" }],
  ])("refuses %s before touching the database", async (_label, ordersBody, unlockBody) => {
    expect((await lockOrders("support", ordersBody)).status).toBe(400);
    expect((await forceUnlock("super", unlockBody)).status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
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
