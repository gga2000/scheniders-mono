// Sign a Playwright page in without the login form.
//
// The live login form carries a Cloudflare Turnstile check, which refuses
// headless browsers by design. Supabase's CAPTCHA does not gate verifyOtp, so
// the e2e run mints a real session for E2E_EMAIL with the service-role key
// (Node only, never sent to the browser) and hands the page the same cookies
// the app's @supabase/ssr client writes. No bypass exists in production code.

import { test, type Page } from "@playwright/test";
import { loadEnvFile, mintSessionCookies, type MintedSession } from "./perf/session";
import path from "node:path";

loadEnvFile(path.resolve(__dirname, "../.env.local"));

/** True when this run can sign in: an email to use and the service-role key. */
export function canMintSession(email: string | undefined): email is string {
    return Boolean(email && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Signs the page in and opens `landing`; returns the session, for reading as the same user from Node. */
export async function loginWithSession(page: Page, email: string, landing = "/orders"): Promise<MintedSession> {
    const baseUrl = test.info().project.use.baseURL;
    if (!baseUrl) throw new Error("Playwright baseURL is not set");
    const session = await mintSessionCookies(email, baseUrl);
    await page.context().addCookies(session.cookies);
    await page.goto(landing);
    return session;
}
