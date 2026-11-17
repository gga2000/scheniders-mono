import { test as base, expect, type Page } from "@playwright/test";

/**
 * A signed-in staff console page whose writes never leave the browser.
 *
 * - Signed in with the password grant of E2E_ADMIN_EMAIL, as the cookie the
 *   console's @supabase/ssr client reads (the sign-in form's Turnstile check
 *   refuses headless browsers by design). Nothing in the console is bypassed.
 * - Every request that is not a GET or HEAD is stopped, so no press can
 *   change data, and /api/export is never fetched. Two reads the console
 *   sends as POST (who last acted on each shop, and Sentry's error reports)
 *   are stopped too, but are not counted as writes.
 * - Each test fails on a page error, an API read the server refused or
 *   failed (401, 403, 5xx), or anything the script policy (lib/csp.ts) stopped
 *   or, while it only reports, would have stopped; and lists the writes a
 *   press tried to send.
 */

const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Reads the console sends as POST: stopped like any write, not counted as one. */
const READS_SENT_AS_POST = [/^\/api\/admin\/last-actors$/];

/** What @supabase/ssr cuts a long cookie into. */
const COOKIE_CHUNK = 3180;

let session: string | null = null;

async function signIn(): Promise<string> {
  if (session) return session;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Staff sign-in refused (${res.status})`);
  session = `base64-${Buffer.from(JSON.stringify(await res.json())).toString("base64url")}`;
  return session;
}

export interface ConsoleWatch {
  /** Writes a press tried to send ("POST /api/…"), stopped in the browser. */
  writes: string[];
  /** Page errors, refused or failed API reads and script policy breaches, which fail the test. */
  problems: string[];
}

export const test = base.extend<{ watch: ConsoleWatch }>({
  watch: async ({ page, baseURL }, provide) => {
    test.skip(!EMAIL || !PASSWORD || !SUPABASE_URL || !ANON_KEY, "Needs a staff login: see playwright.config.ts");
    if (!baseURL) throw new Error("Playwright baseURL is not set");
    const host = new URL(baseURL).hostname;
    const ref = new URL(SUPABASE_URL ?? "").hostname.split(".")[0];
    const value = await signIn();
    const name = `sb-${ref}-auth-token`;
    const parts = value.length <= COOKIE_CHUNK ? [[name, value]] : chunk(value).map((v, i) => [`${name}.${i}`, v]);
    await page.context().addCookies(
      parts.map(([n, v]) => ({ name: n, value: v, domain: host, path: "/", secure: true, sameSite: "Lax" as const })),
    );

    const watch: ConsoleWatch = { writes: [], problems: [] };
    await page.context().route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/export")) return route.abort();
      if (request.method() === "GET" || request.method() === "HEAD") return route.fallback();
      if (url.hostname === host && !READS_SENT_AS_POST.some((read) => read.test(url.pathname))) {
        watch.writes.push(`${request.method()} ${url.pathname}`);
      }
      return route.abort();
    });
    page.on("pageerror", (error) => watch.problems.push(`page error: ${error.message.slice(0, 200)}`));
    await page.exposeBinding("reportScriptPolicyBreach", (_source, breach: string) => {
      watch.problems.push(`script policy: ${breach}`);
    });
    await page.addInitScript(() => {
      const report = (window as unknown as { reportScriptPolicyBreach: (breach: string) => void }).reportScriptPolicyBreach;
      document.addEventListener("securitypolicyviolation", (event) => {
        report(`${event.effectiveDirective} ${event.blockedURI || "(inline)"} at ${event.sourceFile}:${event.lineNumber}`);
      });
    });
    page.on("response", (response) => {
      const url = new URL(response.url());
      const status = response.status();
      if (url.hostname === host && url.pathname.startsWith("/api/") && (status === 401 || status === 403 || status >= 500)) {
        watch.problems.push(`${status} ${response.request().method()} ${url.pathname}`);
      }
    });

    await provide(watch);
    expect(watch.problems, "page errors and refused or failed reads").toEqual([]);
  },
});

function chunk(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; i += COOKIE_CHUNK) out.push(value.slice(i, i + COOKIE_CHUNK));
  return out;
}

/** Open a console page and wait until its reads have answered. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.locator("h1").first()).toBeVisible();
}

export { expect };
