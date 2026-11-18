import { defineConfig, devices } from "@playwright/test";

/**
 * The staff console's browser smoke suite (e2e/): every menu page opens, and
 * the presses that only show things work, signed in as a staff login, with
 * every write stopped in the browser before it leaves (e2e/console.ts).
 *
 *   E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… \
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
 *   pnpm --filter @scheniders/admin test:e2e
 *
 * E2E_BASE_URL picks the console (default: the live one). It is not in CI,
 * which has no staff login. PLAYWRIGHT_CHROMIUM_PATH points at a Chromium
 * when the one matching this Playwright is not installed.
 */
export default defineConfig({
  testDir: "./e2e",
  // One staff login, one browser at a time: the live console is not a load test.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://scheniders-mono-admin.vercel.app",
    timezoneId: "Asia/Baghdad",
    trace: "off",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
