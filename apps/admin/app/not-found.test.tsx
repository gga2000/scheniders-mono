// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { prerender } from "react-dom/static";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/*
 * A wrong link inside the console showed the framework's bare "404" with no
 * menu. Any address with no page now gets the console's own not-found page,
 * inside the menu. Round 18: the tab was named by the page once it ran, so
 * the first answer's tab read "Admin", or "Merchants" under
 * /merchants/<id>/extra. The shell now names it in the first answer.
 * Round 24: Next sends the root not-found page's client code with every page,
 * so the menu it draws is loaded only when it is drawn, not a second time on
 * every page next to (dashboard)'s own copy.
 */

const shell = vi.hoisted(() => ({ loaded: false }));

vi.mock("next/navigation", async (real) => ({
  ...(await real<typeof import("next/navigation")>()),
  usePathname: () => "/merchants/5b0c9a52/extra",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/shared/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/layout/admin-shell", () => {
  shell.loaded = true;
  return {
    AdminShell: ({ children, pageName }: { children: ReactNode; pageName?: string }) =>
      createElement("div", { "data-shell": "menu", "data-page-name": pageName }, children),
  };
});

const { default: NotFound } = await import("./not-found");
const shellLoadedWithThePage = shell.loaded;
const { ConsoleNotFound } = await import("@/components/shared/console-not-found");
const { AdminTopbar } = await import("@/components/layout/admin-topbar");

afterEach(cleanup);

/** The server's HTML once everything in it is loaded, as the first answer sends it. */
async function firstAnswer(): Promise<string> {
  const { prelude } = await prerender(createElement(NotFound));
  return new Response(prelude).text();
}

describe("an address the console has no page for", () => {
  it("loads the menu only when it is drawn, so other pages do not carry it twice", async () => {
    expect(shellLoadedWithThePage).toBe(false);
    await firstAnswer();
    expect(shell.loaded).toBe(true);
  });

  it("is drawn inside the console's menu in the first answer, which names the tab", async () => {
    const html = await firstAnswer();
    expect(html).toMatch(/<div data-shell="menu" data-page-name="Page not found">/);
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
