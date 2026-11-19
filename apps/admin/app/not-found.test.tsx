// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/*
 * A wrong link inside the console showed the framework's bare "404" with no
 * menu. Any address with no page now gets the console's own not-found page,
 * inside the menu. Round 18: the tab was named by the page once it ran, so
 * the first answer's tab read "Admin", or "Merchants" under
 * /merchants/<id>/extra. The shell now names it in the first answer.
 */

vi.mock("next/navigation", async (real) => ({
  ...(await real<typeof import("next/navigation")>()),
  usePathname: () => "/merchants/5b0c9a52/extra",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/shared/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children, pageName }: { children: ReactNode; pageName?: string }) =>
    createElement("div", { "data-shell": "menu", "data-page-name": pageName }, children),
}));

const { default: NotFound } = await import("./not-found");
const { ConsoleNotFound } = await import("@/components/shared/console-not-found");
const { AdminTopbar } = await import("@/components/layout/admin-topbar");

afterEach(cleanup);

describe("an address the console has no page for", () => {
  it("is drawn inside the console's menu, which names the tab", () => {
    const html = renderToStaticMarkup(createElement(NotFound));
    expect(html).toMatch(/^<div data-shell="menu" data-page-name="Page not found">/);
    expect(html).toContain("This page does not exist");
  });

  it("names the tab in the top bar's first draw, not the menu page the address starts with", () => {
    render(createElement(AdminTopbar, { user: null, pageName: "Page not found" }));
    expect(document.title).toBe("Page not found · Scheniders Admin");
  });

  it("names the address and leads to the Dashboard", () => {
    render(createElement(ConsoleNotFound));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This page does not exist");
    expect(screen.getByText("/merchants/5b0c9a52/extra")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the Dashboard" }).getAttribute("href")).toBe("/");
  });
});
