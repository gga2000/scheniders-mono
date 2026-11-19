// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/*
 * A wrong link inside the console showed the framework's bare "404" with no
 * menu. Any address with no page now gets the console's own not-found page,
 * inside the menu.
 */

vi.mock("next/navigation", async (real) => ({
  ...(await real<typeof import("next/navigation")>()),
  usePathname: () => "/merchant/old-link",
}));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: ReactNode }) => createElement("div", { "data-shell": "menu" }, children),
}));

const { default: NotFound } = await import("./not-found");
const { ConsoleNotFound } = await import("@/components/shared/console-not-found");
const { usePageHeader } = await import("@/store/use-page-header");

afterEach(cleanup);

describe("an address the console has no page for", () => {
  it("is drawn inside the console's menu", () => {
    const html = renderToStaticMarkup(createElement(NotFound));
    expect(html).toMatch(/^<div data-shell="menu">/);
    expect(html).toContain("This page does not exist");
  });

  it("names the address, leads to the Dashboard and names the tab", () => {
    render(createElement(ConsoleNotFound));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This page does not exist");
    expect(screen.getByText("/merchant/old-link")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the Dashboard" }).getAttribute("href")).toBe("/");
    expect(usePageHeader.getState().tab).toBe("Page not found");
  });
});
