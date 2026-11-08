// Customer profile end-to-end, against the real app with a real login.
//
//   E2E_EMAIL=… E2E_PASSWORD=… E2E_BASE_URL=https://schenidersapp.xyz \
//     pnpm --filter @scheniders/platform exec playwright test e2e/customers.spec.ts --project=chromium
//
// Read-only: opens the profile of the orders fixture's fake customer
// (07000000001, order E2E0000001) and checks it loads. Guards against the
// profile query failing as a whole, e.g. an ambiguous table link in one of its
// eight reads. Skipped when the login variables are not set.

import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const FIXTURE_PHONE = "07000000001";

test.skip(!EMAIL || !PASSWORD, "E2E_EMAIL and E2E_PASSWORD are not set");
test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

test.describe("Customer profile", () => {
    test("opens without the load-failed screen", async ({ page }) => {
        await page.goto("/login");
        await page.locator("input[type=email]").first().fill(EMAIL ?? "");
        await page.locator("input[type=password]").first().fill(PASSWORD ?? "");
        await page.locator("button[type=submit]").first().click();
        await page.waitForURL(/\/orders/, { timeout: 60_000 });

        await page.goto(`/customers/${FIXTURE_PHONE}`);
        await expect(page.locator(".customer-profile")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText(/تعذّر تحميل بيانات العميل|Couldn't load this customer/)).toHaveCount(0);
    });
});
