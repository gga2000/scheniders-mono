import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { AdminRole } from "@/types/admin";

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

/** A PostgREST-shaped builder: every method chains, awaiting yields `dbResult`. */
function fakeQuery(): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: DbResult) => void) => resolve(dbResult);
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
    if (!identity) throw new Error("Invalid access token");
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

type Case = {
  name: string;
  call: (token: string | null) => Promise<Response>;
};

/** Mutations support_staff must NOT be able to perform. */
const SUPER_ADMIN_ONLY: Case[] = [
  {
    name: "POST /api/billing/topup (top_up_wallet)",
    call: async (t) => {
      const { POST } = await import("./billing/topup/route");
      return POST(req("/api/billing/topup", "POST", t, { tenant_id: TENANT, amount: 5000 }));
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
    name: "PUT /api/merchants/[id]/tags (manage_tags)",
    call: async (t) => {
      const { PUT } = await import("./merchants/[id]/tags/route");
      return PUT(req(`/api/merchants/${TENANT}/tags`, "PUT", t, { tags: ["vip"] }), idParams);
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
];

/** Handlers both roles may use (reads, and actions support_staff holds). */
const ANY_ADMIN: Case[] = [
  {
    name: "POST /api/merchants/[id]/extend-trial (extend_trial)",
    call: async (t) => {
      const { POST } = await import("./merchants/[id]/extend-trial/route");
      return POST(req(`/api/merchants/${TENANT}/extend-trial`, "POST", t, { days: 7 }), idParams);
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
 * Structural net: a new route handler that forgets its guard fails here, not in
 * production. Each exported handler body must call one of the guards.
 */
describe("every admin API handler is guarded", () => {
  const API_DIR = path.resolve(__dirname);
  const GUARD = /\b(requireAdminPermission|requireAdminFromRequest|requireAdmin)\(/;
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
    },
  );
});
