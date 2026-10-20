import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { AdminAuthError } from "@/lib/admin-auth-error";

/**
 * Auth failures must come back as 401/403, and real server failures as 500 —
 * not the other way round. The CRM routes (leads, industries, team, outreach)
 * used to catch `requireAdmin`'s throw in their generic `catch` and answer 500
 * for a bad token; the cookie/bearer guard answered 403 for an auth-server
 * outage. Every handler is called for real; only the Supabase layer is faked.
 */

const ADMIN = { user: { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com" }, role: "super_admin" };

/** Bearer tokens → what `requireAdmin` does with them. */
const TOKENS = {
  valid: "valid-token",
  rejected: "rejected-token", // expired / revoked / malformed JWT
  outsider: "outsider-token", // real user, no admin_users row
  outage: "outage-token", // auth server or admin_users lookup fails
} as const;

const OUTAGE = new Error("auth server unreachable");

type DbResult = { data: unknown; error: { code: string; message: string } | null };
let dbResult: DbResult;

function fakeQuery(): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: DbResult) => void) => resolve(dbResult);
      return () => fakeQuery();
    },
  });
}

const createAdminClient = vi.fn(() => fakeQuery());

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient,
  requireAdmin: vi.fn(async (token: string) => {
    if (token === TOKENS.valid) return ADMIN;
    if (token === TOKENS.rejected) throw new AdminAuthError(401, "invalid JWT");
    if (token === TOKENS.outsider) throw new AdminAuthError(403, "No admin-console access");
    if (token === TOKENS.outage) throw OUTAGE;
    throw new Error(`unexpected token ${token}`);
  }),
  resolveAdminRole: vi.fn(),
}));

/** What the cookie session's `getUser()` answers (no bearer token sent). */
let cookieGetUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }>;

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: () => cookieGetUser() } }),
}));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  createAdminClient.mockClear();
  dbResult = { data: [], error: null };
  cookieGetUser = async () => ({ data: { user: null }, error: null });
});

function req(pathname: string, method: string, authorization: string | null): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization) headers.set("authorization", authorization);
  return new NextRequest(`http://admin.test${pathname}`, {
    method,
    headers,
    body: method === "GET" || method === "DELETE" ? undefined : "{}",
  });
}

type Handler = (request: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const API_DIR = path.resolve(__dirname);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const PARAMS = {
  id: "44444444-4444-4444-8444-444444444444",
  fid: "55555555-5555-4555-8555-555555555555",
};

/** Every handler behind the bearer-only guard, discovered from source. */
const BEARER_HANDLERS = readdirSync(API_DIR, { recursive: true, encoding: "utf8" })
  .map((f) => f.split(path.sep).join("/"))
  .filter((f) => f.endsWith("route.ts"))
  .sort()
  .flatMap((file) => {
    const src = readFileSync(path.join(API_DIR, file), "utf8");
    const parts = src.split(/export async function (GET|POST|PUT|PATCH|DELETE)\b/);
    const found: { name: string; file: string; method: (typeof METHODS)[number] }[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      const method = METHODS.find((m) => m === parts[i]);
      if (method && /\brequireBearerAdmin\(/.test(parts[i + 1] ?? "")) {
        found.push({ name: `${method} ${file}`, file, method });
      }
    }
    return found;
  });

async function call(
  h: (typeof BEARER_HANDLERS)[number],
  authorization: string | null,
): Promise<Response> {
  const mod: Record<string, unknown> = await import(/* @vite-ignore */ path.join(API_DIR, h.file));
  const handler = mod[h.method] as Handler;
  const url = `/api/${h.file.replace(/\/?route\.ts$/, "")}`;
  return handler(req(url, h.method, authorization), { params: Promise.resolve(PARAMS) });
}

describe("bearer-only CRM routes map auth failures to 401/403", () => {
  it("covers the lead, industry, team and outreach handlers", () => {
    const files = new Set(BEARER_HANDLERS.map((h) => h.file.split("/")[0]));
    expect(files).toEqual(new Set(["industries", "leads", "outreach-templates", "team"]));
    expect(BEARER_HANDLERS.length).toBeGreaterThanOrEqual(33);
  });

  it.each(BEARER_HANDLERS)("$name — no Authorization header → 401", async (h) => {
    const res = await call(h, null);
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(BEARER_HANDLERS)("$name — non-bearer Authorization header → 401", async (h) => {
    const res = await call(h, `Basic ${TOKENS.valid}`);
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(BEARER_HANDLERS)("$name — rejected token → 401", async (h) => {
    const res = await call(h, `Bearer ${TOKENS.rejected}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(BEARER_HANDLERS)("$name — authenticated non-admin → 403", async (h) => {
    const res = await call(h, `Bearer ${TOKENS.outsider}`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  // Either the handler's own catch logs it and answers 500, or (guard outside
  // the try) the error propagates and Next.js answers 500. Never a 2xx/4xx.
  it.each(BEARER_HANDLERS)("$name — auth-server outage → 500, never hidden", async (h) => {
    const outcome = await call(h, `Bearer ${TOKENS.outage}`).then(
      (res) => res.status,
      (error: unknown) => (error === OUTAGE ? "propagated" : Promise.reject(error)),
    );
    expect([500, "propagated"]).toContain(outcome);
    const logged = consoleError.mock.calls.some((args) => args.includes(OUTAGE));
    expect(logged || outcome === "propagated").toBe(true);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(BEARER_HANDLERS)("$name — a valid admin passes the guard", async (h) => {
    const res = await call(h, `Bearer ${TOKENS.valid}`);
    expect([401, 403]).not.toContain(res.status);
  });
});

describe("genuine errors behind a passed guard still surface as 500", () => {
  it("GET /api/leads — a database error is a 500, not an auth status", async () => {
    dbResult = { data: null, error: { code: "57014", message: "statement timeout" } };
    const { GET } = await import("./leads/route");
    const res = await GET(req("/api/leads", "GET", `Bearer ${TOKENS.valid}`));
    expect(res.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
  });

  it("GET /api/team — a database error is a 500, not an auth status", async () => {
    dbResult = { data: null, error: { code: "57014", message: "statement timeout" } };
    const { GET } = await import("./team/route");
    const res = await GET(req("/api/team", "GET", `Bearer ${TOKENS.valid}`));
    expect(res.status).toBe(500);
  });
});

describe("requireAdminFromRequest (bearer or cookie transport)", () => {
  // Imported lazily: the module graph must load after the mocks above exist.
  const requireAdminFromRequest = async (request: NextRequest) =>
    (await import("@/lib/api-auth")).requireAdminFromRequest(request);

  it("rejected bearer token → 401 (was 403)", async () => {
    const res = await requireAdminFromRequest(req("/x", "GET", `Bearer ${TOKENS.rejected}`));
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
  });

  it("authenticated non-admin bearer → 403", async () => {
    const res = await requireAdminFromRequest(req("/x", "GET", `Bearer ${TOKENS.outsider}`));
    expect((res as NextResponse).status).toBe(403);
  });

  it("auth-server outage on the bearer path propagates instead of becoming 403", async () => {
    await expect(requireAdminFromRequest(req("/x", "GET", `Bearer ${TOKENS.outage}`))).rejects.toBe(OUTAGE);
  });

  it("no session cookie → 401", async () => {
    const res = await requireAdminFromRequest(req("/x", "GET", null));
    expect((res as NextResponse).status).toBe(401);
  });

  it("cookie session the auth server rejects → 401", async () => {
    const { AuthApiError } = await import("@supabase/supabase-js");
    cookieGetUser = async () => ({ data: { user: null }, error: new AuthApiError("bad_jwt", 403, "bad_jwt") });
    const res = await requireAdminFromRequest(req("/x", "GET", null));
    expect((res as NextResponse).status).toBe(401);
  });

  it("cookie session check that cannot reach the auth server propagates", async () => {
    const { AuthRetryableFetchError } = await import("@supabase/supabase-js");
    cookieGetUser = async () => ({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    await expect(requireAdminFromRequest(req("/x", "GET", null))).rejects.toThrow(/Session validation failed/);
  });

  it("valid cookie user without admin access → 403; admin_users outage propagates", async () => {
    const { resolveAdminRole } = await import("@/lib/admin-supabase");
    const resolve = vi.mocked(resolveAdminRole);
    cookieGetUser = async () => ({ data: { user: { id: ADMIN.user.id } }, error: null });

    resolve.mockRejectedValueOnce(new AdminAuthError(403, "No admin-console access"));
    const res = await requireAdminFromRequest(req("/x", "GET", null));
    expect((res as NextResponse).status).toBe(403);

    resolve.mockRejectedValueOnce(OUTAGE);
    await expect(requireAdminFromRequest(req("/x", "GET", null))).rejects.toBe(OUTAGE);
  });

  it("a passing route that uses it still turns a DB error into a 500", async () => {
    dbResult = { data: null, error: { code: "57014", message: "statement timeout" } };
    const { GET } = await import("./merchants/route");
    const res = await GET(req("/api/merchants", "GET", `Bearer ${TOKENS.valid}`));
    expect(res.status).toBe(500);
  });
});
