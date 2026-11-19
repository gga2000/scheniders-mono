// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/*
 * A wrong link inside the console showed the framework's bare "404" with no
 * menu. Any address with no page now ends in the console's not-found page.
 */

vi.mock("next/navigation", async (real) => ({
  ...(await real<typeof import("next/navigation")>()),
  usePathname: () => "/merchant/old-link",
}));

const { default: MissingPage } = await import("./[...missing]/page");
const { default: ConsoleNotFound } = await import("./not-found");
const { usePageHeader } = await import("@/store/use-page-header");

afterEach(cleanup);

describe("an address the console has no page for", () => {
  it("answers 404 and falls to the console's not-found page", () => {
    let thrown: unknown;
    try {
      MissingPage();
    } catch (e) {
      thrown = e;
    }
    expect(String((thrown as { digest?: string }).digest)).toMatch(/;404$/);
  });

  it("names the address, leads to the Dashboard and names the tab", () => {
    render(createElement(ConsoleNotFound));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This page does not exist");
    expect(screen.getByText("/merchant/old-link")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the Dashboard" }).getAttribute("href")).toBe("/");
    expect(usePageHeader.getState().tab).toBe("Page not found");
  });
});
