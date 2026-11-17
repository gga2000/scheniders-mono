import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";

/**
 * The middleware decides who reaches the console. A database or auth-server
 * blip used to read as "no access": staff were sent to /login?error=forbidden
 * and API calls got 403. Now a failed check answers 503 and keeps the session.
 */

type GetUser = { data: { user: { id: string } | null }; error: unknown };
type AdminRead = { data: { admin_role: string; is_active: boolean } | null; error: { message: string } | null };

let getUser: GetUser;
let adminRead: AdminRead;
/** Cookies the Supabase client sets, as when it refreshes the session. */
let refreshedCookies: Array<{ name: string; value: string; options: object }>;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    { cookies }: { cookies: { setAll: (list: typeof refreshedCookies) => void } },
  ) => ({
    auth: {
      getUser: async () => {
        if (refreshedCookies.length > 0) cookies.setAll(refreshedCookies);
        return getUser;
      },
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => adminRead,
      };
      return query;
    },
  }),
}));

const { middleware } = await import("./middleware");
const { CSP_HEADER, NEXT_NONCE_SOURCE } = await import("./lib/csp");

const STAFF = { id: "11111111-1111-4111-8111-111111111111" };
const call = (path: string) => middleware(new NextRequest(`https://console.test${path}`));

beforeEach(() => {
  getUser = { data: { user: STAFF }, error: null };
  adminRead = { data: { admin_role: "super_admin", is_active: true }, error: null };
  refreshedCookies = [];
});

describe("middleware access check", () => {
  it("lets an active admin through", async () => {
    const response = await call("/merchants");
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends a signed-out visitor to the login page, and answers 401 on the API", async () => {
    getUser = { data: { user: null }, error: new AuthSessionMissingError() };
    expect((await call("/merchants")).headers.get("location")).toBe("https://console.test/login");
    expect((await call("/api/leads")).status).toBe(401);
  });

  it("treats a token the auth server rejects as signed out", async () => {
    getUser = { data: { user: null }, error: new AuthApiError("invalid JWT", 401, "bad_jwt") };
    expect((await call("/merchants")).headers.get("location")).toBe("https://console.test/login");
  });

  it("sends a signed-in non-admin to the login page with forbidden, and answers 403 on the API", async () => {
    adminRead = { data: null, error: null };
    expect((await call("/merchants")).headers.get("location")).toBe("https://console.test/login?error=forbidden");
    expect((await call("/api/leads")).status).toBe(403);
    adminRead = { data: { admin_role: "super_admin", is_active: false }, error: null };
    expect((await call("/api/leads")).status).toBe(403);
  });

  it("answers 503, not forbidden, when the admin_users read fails", async () => {
    adminRead = { data: null, error: { message: "connection lost" } };
    const page = await call("/merchants?tab=all");
    expect(page.status).toBe(503);
    expect(page.headers.get("location")).toBeNull();
    const html = await page.text();
    expect(html).toContain("Could not check your access");
    expect(html).toContain('href="/merchants?tab=all"');

    const api = await call("/api/leads");
    expect(api.status).toBe(503);
    expect(await api.json()).toEqual({ error: "Could not check your access. Try again in a moment." });
  });

  it("answers 503, not signed out, when the auth server does not answer", async () => {
    getUser = { data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) };
    expect((await call("/merchants")).status).toBe(503);
    expect((await call("/api/leads")).status).toBe(503);
    getUser = { data: { user: null }, error: new AuthApiError("server error", 500, "unexpected_failure") };
    expect((await call("/api/leads")).status).toBe(503);
  });

  it("still shows the login page during an outage", async () => {
    adminRead = { data: null, error: { message: "connection lost" } };
    expect((await call("/login")).status).toBe(200);
  });

  it("keeps a refreshed session on every answer it builds", async () => {
    refreshedCookies = [{ name: "sb-session", value: "fresh", options: { path: "/" } }];
    adminRead = { data: null, error: { message: "connection lost" } };
    expect((await call("/api/leads")).cookies.get("sb-session")?.value).toBe("fresh");
    adminRead = { data: null, error: null };
    expect((await call("/merchants")).cookies.get("sb-session")?.value).toBe("fresh");
  });
});

describe("writes from other sites", () => {
  const write = (path: string, headers: Record<string, string>) =>
    middleware(new NextRequest(`https://console.test${path}`, { method: "POST", headers }));

  it("refuses an API write sent from another site, before reading the sign-in", async () => {
    getUser = { data: { user: null }, error: { message: "must not be asked" } };
    const response = await write("/api/merchants/bulk", { origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "This change did not come from the staff console, so it was refused." });
  });

  it("lets an API write from the console's own pages reach the access check", async () => {
    expect((await write("/api/merchants/bulk", { origin: "https://console.test" })).status).toBe(200);
    adminRead = { data: null, error: null };
    expect((await write("/api/merchants/bulk", { origin: "https://console.test" })).status).toBe(403);
  });

  it("leaves API reads and pages to the access check", async () => {
    const read = await middleware(new NextRequest("https://console.test/api/leads", { headers: { origin: "https://evil.example" } }));
    expect(read.status).toBe(200);
    expect((await write("/merchants", { origin: "https://evil.example" })).status).toBe(200);
  });
});

describe("the script policy", () => {
  const nonceIn = (policy: string | null) => policy?.match(/'nonce-([A-Za-z0-9+/]+={0,2})'/)?.[1];

  it("sends a policy with a nonce of its own on every answer, and hands the same nonce to the page", async () => {
    const first = await call("/merchants");
    const second = await call("/merchants");
    const policy = first.headers.get(CSP_HEADER);
    const nonce = nonceIn(policy);

    expect(policy).toContain("'strict-dynamic'");
    expect(nonce).toBeTruthy();
    expect(nonceIn(second.headers.get(CSP_HEADER))).not.toBe(nonce);
    // Forwarded to Next.js (its scripts) and to the root layout (the before-paint script).
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(first.headers.get(`x-middleware-request-${NEXT_NONCE_SOURCE}`)).toBe(policy);
  });

  it("replaces a nonce the browser sent", async () => {
    const response = await middleware(
      new NextRequest("https://console.test/merchants", { headers: { "x-nonce": "chosen-by-the-page" } }),
    );
    expect(response.headers.get("x-middleware-request-x-nonce")).not.toBe("chosen-by-the-page");
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonceIn(response.headers.get(CSP_HEADER)));
  });

  it("is on the answers the middleware builds itself too", async () => {
    getUser = { data: { user: null }, error: null };
    expect((await call("/merchants")).headers.get(CSP_HEADER)).toContain("script-src");
    adminRead = { data: null, error: { message: "connection lost" } };
    getUser = { data: { user: STAFF }, error: null };
    expect((await call("/merchants")).headers.get(CSP_HEADER)).toContain("script-src");
  });
});
