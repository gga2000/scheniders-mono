import { describe, it, expect, vi, beforeEach, type Mock, type MockInstance } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { AuthApiError, AuthInvalidJwtError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { NO_CONSOLE_ACCESS, isNoConsoleAccess } from "@/lib/staff-sign-in";

/**
 * The middleware decides who reaches the console. A database or auth-server
 * blip used to read as "no access": staff were sent to /login?error=forbidden
 * and API calls got 403. Now a failed check answers 503 and keeps the session.
 */

type GetUser = { data: { user: { id: string } | null }; error: unknown };
type Claims = Record<string, unknown>;
type GetClaims = { data: { claims: Claims } | null; error: unknown };
type AdminRead = { data: { admin_role: string; is_active: boolean } | null; error: { message: string } | null };

let getUser: GetUser;
/** What the local check of the session's own token answers. */
let sessionClaims: GetClaims;
/** Claims of the tokens an API call sends in its Authorization header, by token. */
let sentClaims: Record<string, Claims>;
let signOut: Mock<(options: { scope: string }) => Promise<{ error: unknown }>>;
let signOutError: unknown;
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
      getClaims: async (token?: string) => {
        if (token === undefined) return sessionClaims;
        const claims = sentClaims[token];
        return claims ? { data: { claims }, error: null } : { data: null, error: new AuthInvalidJwtError("Invalid JWT signature") };
      },
      signOut: (options: { scope: string }) => {
        cookies.setAll([{ name: "sb-session", value: "", options: { path: "/", maxAge: 0 } }]);
        return signOut(options);
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
const SESSION = "22222222-2222-4222-8222-222222222222";
const HOUR = 60 * 60 * 1000;
const call = (path: string) => middleware(new NextRequest(`https://console.test${path}`));

/** The claims of a token of `session`, signed in `hoursAgo` hours ago. */
function claimsOf(session: string, hoursAgo = 1): Claims {
  return {
    sub: STAFF.id,
    session_id: session,
    exp: Math.floor((Date.now() + HOUR) / 1000),
    amr: [{ method: "password", timestamp: Math.floor((Date.now() - hoursAgo * HOUR) / 1000) }],
  };
}

beforeEach(() => {
  getUser = { data: { user: STAFF }, error: null };
  sessionClaims = { data: { claims: claimsOf(SESSION) }, error: null };
  sentClaims = {};
  signOutError = null;
  signOut = vi.fn<(options: { scope: string }) => Promise<{ error: unknown }>>(async () => ({ error: signOutError }));
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

  // Round 15: the API's 403 looked like any other, so an open page whose role
  // was removed never left. It carries the mark adminFetch leaves on.
  it("marks the API's no-access 403, in the login page's words", async () => {
    adminRead = { data: { admin_role: "sales", is_active: false }, error: null };
    const answer = await call("/api/leads");
    expect(isNoConsoleAccess(answer)).toBe(true);
    expect(await answer.json()).toEqual({ error: NO_CONSOLE_ACCESS });
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

describe("how long a staff sign-in lasts", () => {
  it("ends a sign-in older than 16 hours, here and on the auth server, and says why", async () => {
    sessionClaims = { data: { claims: claimsOf(SESSION, 17) }, error: null };
    const page = await call("/merchants");
    expect(page.headers.get("location")).toBe("https://console.test/login?error=expired");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    // The browser's session cookie goes with the answer.
    expect(page.cookies.get("sb-session")?.value).toBe("");

    const api = await call("/api/leads");
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: "Your sign-in ended after 16 hours. Sign in again." });
  });

  it("lets a sign-in from the start of the support day through", async () => {
    sessionClaims = { data: { claims: claimsOf(SESSION, 15) }, error: null };
    expect((await call("/merchants")).status).toBe(200);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("shows the login page to an ended sign-in instead of sending it back to the console", async () => {
    sessionClaims = { data: { claims: claimsOf(SESSION, 17) }, error: null };
    const login = await call("/login?error=expired");
    expect(login.status).toBe(200);
    expect(login.headers.get("location")).toBeNull();
  });

  it("still sends staff to sign in again when ending the old sign-in failed, and reports it", async () => {
    sessionClaims = { data: { claims: claimsOf(SESSION, 17) }, error: null };
    signOutError = new AuthRetryableFetchError("fetch failed", 0);
    expect((await call("/merchants")).headers.get("location")).toBe("https://console.test/login?error=expired");
    expect(errors).toHaveBeenCalledWith("[middleware] Ending an old sign-in failed", { path: "/merchants", message: "fetch failed" });
  });

  it("treats a session token that does not check out as signed out", async () => {
    sessionClaims = { data: null, error: new AuthInvalidJwtError("Invalid JWT signature") };
    expect((await call("/merchants")).headers.get("location")).toBe("https://console.test/login");
    expect((await call("/api/leads")).status).toBe(401);
  });

  // Round 14: an open page learns of the end from an API answer and reloads;
  // the session is gone by then, so a mark tells the login page why.
  it("marks an ended sign-in, so the page that reloads after the API's 401 is told why", async () => {
    sessionClaims = { data: { claims: claimsOf(SESSION, 17) }, error: null };
    const api = await call("/api/leads");
    expect(api.cookies.get("staff_sign_in_ended")?.value).toBe("1");

    getUser = { data: { user: null }, error: new AuthSessionMissingError() };
    const marked = (path: string) =>
      middleware(new NextRequest(`https://console.test${path}`, { headers: { cookie: "staff_sign_in_ended=1" } }));
    expect((await marked("/merchants")).headers.get("location")).toBe("https://console.test/login?error=expired");
    expect((await call("/merchants")).headers.get("location")).toBe("https://console.test/login");
  });

  it("clears the mark once staff are signed in again", async () => {
    sessionClaims = { data: { claims: claimsOf(SESSION, 1) }, error: null };
    const page = await middleware(new NextRequest("https://console.test/merchants", { headers: { cookie: "staff_sign_in_ended=1" } }));
    expect(page.status).toBe(200);
    expect(page.cookies.get("staff_sign_in_ended")?.value).toBe("");
  });

  it("answers 503 when the keys to check the token cannot be read", async () => {
    sessionClaims = { data: null, error: new AuthRetryableFetchError("fetch failed", 0) };
    expect((await call("/merchants")).status).toBe(503);
    expect((await call("/api/leads")).status).toBe(503);
  });
});

describe("the API's token is the session the auth server answered for", () => {
  const withToken = (token: string) =>
    middleware(new NextRequest("https://console.test/api/leads", { headers: { authorization: `Bearer ${token}` } }));

  it("lets the browser's own token through, even one refreshed since", async () => {
    sentClaims = { own: claimsOf(SESSION) };
    expect((await withToken("own")).status).toBe(200);
  });

  it("refuses a token of another session, a forged one, and an expired one", async () => {
    sentClaims = {
      other: claimsOf("33333333-3333-4333-8333-333333333333"),
      expired: { ...claimsOf(SESSION), exp: Math.floor(Date.now() / 1000) - 60 },
    };
    for (const token of ["other", "forged", "expired"]) {
      const response = await withToken(token);
      expect(response.status, token).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    }
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

/*
 * Round 15 (Reliability new 4): Vercel's scheduler calls the hourly check with
 * its secret and no staff session. The route checks the secret and fails
 * closed (lib/cron-auth.test.ts); the middleware lets only a read that carries
 * a bearer token reach it, and never reads a sign-in for it.
 */
describe("the scheduled checks", () => {
  const scheduled = (init: { method?: string; headers?: Record<string, string> } = {}) =>
    middleware(new NextRequest("https://console.test/api/cron/hourly-jobs", init));

  beforeEach(() => {
    getUser = { data: { user: null }, error: { message: "must not be asked" } };
    adminRead = { data: null, error: { message: "must not be asked" } };
  });

  it("hands the scheduler's read to the route, which checks its secret", async () => {
    const response = await scheduled({ headers: { authorization: "Bearer the-scheduler-secret" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(errors).not.toHaveBeenCalled();
  });

  it("answers 401 to a read with no bearer token, and to any write", async () => {
    expect((await scheduled()).status).toBe(401);
    const write = await scheduled({
      method: "POST",
      headers: { authorization: "Bearer the-scheduler-secret", origin: "https://console.test" },
    });
    expect(write.status).toBe(401);
  });

  it("is only the /api/cron/ addresses: the rest of the API still needs a staff sign-in", async () => {
    const read = await middleware(
      new NextRequest("https://console.test/api/hourly-jobs", { headers: { authorization: "Bearer the-scheduler-secret" } }),
    );
    expect(read.status).toBe(503);
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

  it("skips those by their whole name, not by how an address starts", () => {
    // Round 12: "/favicon.icox" got no script policy and a bare 404.
    const seen = ["/favicon.icox", "/favicon.ico/x", "/faviconXico", "/_vercelx", "/_next/staticx", "/_next/imagex", "/support-sw.jsx", "/support-swXjs"];
    for (const url of seen) expect(sees(url), url).toBe(true);
    expect(sees("/_vercel/x"), "/_vercel/x").toBe(false);
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
