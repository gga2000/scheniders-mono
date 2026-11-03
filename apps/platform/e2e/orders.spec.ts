// /orders end-to-end, against the real app with a real login.
//
//   E2E_EMAIL=… E2E_PASSWORD=… E2E_BASE_URL=https://schenidersapp.xyz \
//     pnpm --filter @scheniders/platform exec playwright test e2e/orders.spec.ts --project=chromium
//
// Touches ONE fixture order only: is_test = true, order number E2E0000001, a fake
// phone, one item with no product (so no stock moves). The status change is made
// and then put back, also when the test fails half way. Skipped when the login
// variables are not set. The password is only ever typed into the login form.

import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

const FIXTURE_ORDER_NUMBER = "E2E0000001";
const FIXTURE_CUSTOMER = "E2E TEST ORDER";
const STATUS_NEW = "جديد";
const STATUS_CONTACTED = "تم الاتصال";

test.skip(!EMAIL || !PASSWORD, "E2E_EMAIL and E2E_PASSWORD are not set");
test.use({ viewport: { width: 1440, height: 900 } });

async function login(page: Page): Promise<void> {
    await page.goto("/login");
    await page.locator("input[type=email]").first().fill(EMAIL ?? "");
    await page.locator("input[type=password]").first().fill(PASSWORD ?? "");
    await page.locator("button[type=submit]").first().click();
    await page.waitForURL(/\/orders/, { timeout: 60_000 });
}

/** Search the list for the fixture (any date, any status) and return its card. */
async function findFixtureCard(page: Page) {
    await page.getByPlaceholder(/البحث بالاسم/).fill(FIXTURE_ORDER_NUMBER);
    const card = page.locator("div.group").filter({ hasText: FIXTURE_CUSTOMER }).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    return card;
}

async function setStatus(page: Page, from: string, to: string): Promise<void> {
    const card = await findFixtureCard(page);
    await card.getByRole("button", { name: from, exact: true }).click();
    await page.getByRole("menuitem", { name: to, exact: true }).click();
    await expect(card.getByRole("button", { name: to, exact: true })).toBeVisible();
}

test.describe("Orders page", () => {
    test("changes a test order's status, keeps it after reload, and puts it back", async ({ page }) => {
        await login(page);
        await findFixtureCard(page);

        let changed = false;
        try {
            await setStatus(page, STATUS_NEW, STATUS_CONTACTED);
            changed = true;

            // Saved, not just painted: a reload still shows the new status.
            await page.reload();
            const afterReload = await findFixtureCard(page);
            await expect(afterReload.getByRole("button", { name: STATUS_CONTACTED, exact: true })).toBeVisible();
        } finally {
            if (changed) {
                await page.goto("/orders");
                await setStatus(page, STATUS_CONTACTED, STATUS_NEW);
            }
        }

        await page.reload();
        const reverted = await findFixtureCard(page);
        await expect(reverted.getByRole("button", { name: STATUS_NEW, exact: true })).toBeVisible();
    });

    test("opens the order details popup, shows the order, and closes it", async ({ page }) => {
        await login(page);
        const card = await findFixtureCard(page);

        await card.getByText(FIXTURE_CUSTOMER).first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText(`تفاصيل الطلب ${FIXTURE_ORDER_NUMBER}`)).toBeVisible();
        await expect(dialog.getByText(FIXTURE_CUSTOMER)).toBeVisible();
        await expect(dialog.getByText("0700 000 0001")).toBeVisible();

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
    });
});
