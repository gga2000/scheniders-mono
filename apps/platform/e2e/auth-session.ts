// Sign a Playwright page in without the login form.
//
// The live login form carries a Cloudflare Turnstile check, which refuses
// headless browsers by design. Supabase's CAPTCHA does not gate verifyOtp, so
// the e2e run mints a real session for E2E_EMAIL with the service-role key
// (Node only, never sent to the browser) and hands the page the same cookies
// the app's @supabase/ssr client writes. No bypass exists in production code.

import { test, type Page } from "@playwright/test";
import { loadEnvFile, mintSessionCookies } from "./perf/session";
import path from "node:path";

loadEnvFile(path.resolve(__dirname, "../.env.local"));

/** True when this run can sign in: an email to use and the service-role key. */
export function canMintSession(email: string | undefined): email is string {
    return Boolean(email && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function loginWithSession(page: Page, email: string, landing = "/orders"): Promise<void> {
    const baseUrl = test.info().project.use.baseURL;
    if (!baseUrl) throw new Error("Playwright baseURL is not set");
    const { cookies } = await mintSessionCookies(email, baseUrl);
    await page.context().addCookies(cookies);
    await page.goto(landing);
}
