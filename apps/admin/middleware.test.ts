import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
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
/** What the middleware hands to Sentry (the edge config captures console.error). */
let errors: MockInstance<typeof console.error>;

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

const { middleware, config } = await import("./middleware");
const { CSP_HEADER } = await import("./lib/csp");

const STAFF = { id: "11111111-1111-4111-8111-111111111111" };
const call = (path: string) => middleware(new NextRequest(`https://console.test${path}`));

beforeEach(() => {
  getUser = { data: { user: STAFF }, error: null };
  adminRead = { data: { admin_role: "super_admin", is_active: true }, error: null };
  refreshedCookies = [];
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  errors.mockClear();
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

  // Round 11: /api/auth/* skipped every check for a sign-in return route
  // nothing used. The route is gone, and no API address is open.
  it("checks the sign-in on every API address, /api/auth too", async () => {
    getUser = { data: { user: null }, error: new AuthSessionMissingError() };
    expect((await call("/api/auth/callback?code=x")).status).toBe(401);
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

  it("reports each failed check to Sentry with its stage, and a plain sign-out not at all", async () => {
    adminRead = { data: null, error: { message: "connection lost" } };
    await call("/api/leads");
    adminRead = { data: { admin_role: "super_admin", is_active: true }, error: null };
    getUser = { data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) };
    await call("/merchants");
    getUser = { data: { user: null }, error: new AuthSessionMissingError() };
    await call("/merchants");

    expect(errors.mock.calls).toEqual([
      ["[middleware] Access check failed", { stage: "staff row", path: "/api/leads", message: "connection lost" }],
      ["[middleware] Access check failed", { stage: "sign-in", path: "/merchants", message: "fetch failed" }],
    ]);
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

    // Enforced, not only reported.
    expect(CSP_HEADER).toBe("Content-Security-Policy");
    expect(first.headers.get("content-security-policy-report-only")).toBeNull();
    expect(policy).toContain("'strict-dynamic'");
    expect(nonce).toBeTruthy();
    expect(nonceIn(second.headers.get(CSP_HEADER))).not.toBe(nonce);
    // Forwarded to Next.js (its scripts) and to the root layout (the before-paint script).
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(first.headers.get(`x-middleware-request-${CSP_HEADER.toLowerCase()}`)).toBe(policy);
  });

  it("replaces a nonce the browser sent", async () => {
    const response = await middleware(
      new NextRequest("https://console.test/merchants", { headers: { "x-nonce": "chosen-by-the-page" } }),
    );
    expect(response.headers.get("x-middleware-request-x-nonce")).not.toBe("chosen-by-the-page");
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonceIn(response.headers.get(CSP_HEADER)));
  });

  it("names Sentry's security endpoint for the browser's breach reports", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.us.sentry.io/42");
    vi.stubEnv("VERCEL_ENV", "production");
    const endpoint = "https://o1.ingest.us.sentry.io/api/42/security/?sentry_key=key&sentry_environment=production";
    const response = await call("/merchants");
    vi.unstubAllEnvs();
    expect(response.headers.get(CSP_HEADER)).toContain(`report-uri ${endpoint}; report-to csp`);
    expect(response.headers.get("reporting-endpoints")).toBe(`csp="${endpoint}"`);
    expect((await call("/merchants")).headers.get("reporting-endpoints")).toBeNull();
  });

  it("is on the answers the middleware builds itself too", async () => {
    getUser = { data: { user: null }, error: null };
    expect((await call("/merchants")).headers.get(CSP_HEADER)).toContain("script-src");
    adminRead = { data: null, error: { message: "connection lost" } };
    getUser = { data: { user: STAFF }, error: null };
    expect((await call("/merchants")).headers.get(CSP_HEADER)).toContain("script-src");
  });
});

describe("which addresses the middleware sees", () => {
  const sees = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it("sees every console address, even one that ends like an image", () => {
    // An address ending in .png used to skip the access check and the script
    // policy, while the console still rendered the page under it.
    for (const url of ["/", "/merchants", "/merchants/abc.png", "/leads/x.svg", "/api/leads/x.jpg", "/login"]) {
      expect(sees(url), url).toBe(true);
    }
  });

  it("leaves out only built files, Vercel's own paths and the alerts worker", () => {
    const skipped = ["/_next/static/chunks/app.js", "/_next/image?url=x", "/_vercel/insights/script.js", "/favicon.ico", "/support-sw.js"];
    for (const url of skipped) expect(sees(url), url).toBe(false);
  });
});

describe("browser cache", () => {
  it("keeps API answers (phones, emails, wallets) out of the browser's cache", async () => {
    expect((await call("/api/merchants")).headers.get("cache-control")).toBe("private, no-store");
    getUser = { data: { user: null }, error: null };
    expect((await call("/api/leads")).headers.get("cache-control")).toBe("private, no-store");
  });

  it("leaves pages to Next.js, which already marks them no-store", async () => {
    expect((await call("/merchants")).headers.get("cache-control")).toBeNull();
  });
});
