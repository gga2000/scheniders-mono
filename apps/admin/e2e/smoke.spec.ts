import { menuPages } from "../lib/admin-menu";
import { CSP_HEADER } from "../lib/csp";
import { expect, open, test } from "./console";

/*
 * The staff console in a real browser, signed in, with every write stopped
 * (console.ts). Each test fails on a page error, a refused or failed read or
 * a script policy breach, and on any write a press that only shows things
 * tried to send.
 */

// The second address ends like an image: the console still renders a page
// under it, so it needs the policy as much as any other.
for (const address of ["/merchants", "/merchants/abc.png"]) {
  test(`${address} comes with the script policy, and every script in it carries that answer's nonce`, async ({ page, watch }) => {
    const first = await page.request.get(address);
    const policy = first.headers()[CSP_HEADER.toLowerCase()] ?? "";
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    expect(policy).toContain("'strict-dynamic'");
    expect(nonce).toBeTruthy();

    const scripts = (await first.text()).match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((tag) => !tag.includes(`nonce="${nonce}"`))).toEqual([]);

    const second = await page.request.get(address);
    expect(second.headers()[CSP_HEADER.toLowerCase()]).not.toContain(`'nonce-${nonce}'`);
    expect(watch.writes).toEqual([]);
  });
}

test("API answers stay out of the browser's cache", async ({ page, watch }) => {
  // `watch` signs the page in, so this is a real staff answer, not a 401.
  const answer = await page.request.get("/api/merchants/stats");
  expect(answer.status()).toBe(200);
  expect(answer.headers()["cache-control"]).toBe("private, no-store");
  expect(watch.writes).toEqual([]);
});

test.describe("every page on the menu opens", () => {
  for (const { label, href } of menuPages("super_admin")) {
    test(`${label} (${href})`, async ({ page, watch }) => {
      await open(page, href);
      expect(watch.writes).toEqual([]);
    });
  }
});

test("Merchants: every view shows the shops", async ({ page, watch }) => {
  await open(page, "/merchants");
  for (const view of ["Table view", "Sheet view", "Map view", "Pipeline view", "Cards view"]) {
    await page.getByRole("button", { name: view }).click();
    await expect(page.getByRole("button", { name: view })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByRole("link", { name: "Open merchant page" }).first()).toBeVisible();
  expect(watch.writes).toEqual([]);
});

test("a shop page: its tabs open, and Add money opens and closes without sending", async ({ page, watch }) => {
  await open(page, "/merchants");
  await page.getByRole("link", { name: "Open merchant page" }).first().click();
  await page.waitForURL(/\/merchants\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");

  for (const tab of ["Timeline", "Usage", "Team", "Onboarding", "Overview"]) {
    const button = page.getByRole("button", { name: tab, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }

  await page.getByRole("button", { name: "Add money" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(watch.writes).toEqual([]);
});

test("Leads: every view shows the leads", async ({ page, watch }) => {
  await open(page, "/leads");
  for (const view of ["Kanban", "Cards", "Table"]) {
    const button = page.getByRole("button", { name: view, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  expect(watch.writes).toEqual([]);
});

test("the command palette goes to a page by its name", async ({ page, watch }) => {
  await open(page, "/");
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder("Search pages and actions")).toBeFocused();
  await page.keyboard.type("Trials");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/trials$/);
  expect(watch.writes).toEqual([]);
});

test("the top bar's search finds a shop by its name", async ({ page, watch }) => {
  await open(page, "/merchants");
  await page.getByRole("link", { name: "Open merchant page" }).first().click();
  await page.waitForURL(/\/merchants\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  const shopUrl = new URL(page.url()).pathname;
  const name = (await page.locator("h1").first().innerText()).trim();

  // The box is on the Merchants page; the result opens the shop.
  await open(page, "/merchants");
  await page.getByPlaceholder("Search merchants...").fill(name.slice(0, 4));
  await page.getByRole("button", { name }).first().click();
  await page.waitForURL((url) => url.pathname === shopUrl);
  expect(watch.writes).toEqual([]);
});
