import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * The page's room for the fixed menu started at 0 px and slid to 272 px for
 * half a second after every load, pushing the whole page sideways (layout
 * shift 0.17 to 0.33 on every page). The server's page must already have it.
 */

const { Passthrough, Nothing } = vi.hoisted(() => ({
  Passthrough: ({ children }: { children?: ReactNode }) => children,
  Nothing: () => null,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ user: null, profile: null, role: null, signOut: vi.fn() }),
}));
vi.mock("./admin-sidebar", () => ({ AdminSidebar: Nothing }));
vi.mock("./admin-topbar", () => ({ AdminTopbar: Nothing }));
vi.mock("@/components/shared/command-palette", () => ({
  CommandPalette: Nothing,
  useCommandPalette: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));
vi.mock("@/components/shared/page-transition", () => ({ PageTransition: Passthrough }));
vi.mock("@/components/merchants/watchlist-sync", () => ({ WatchlistSync: Nothing }));

const { AdminShell } = await import("./admin-shell");

describe("AdminShell first paint", () => {
  const html = renderToStaticMarkup(createElement(AdminShell, null, "page"));
  const main = html.match(/<main[^>]*>/)?.[0] ?? "";

  it("leaves room for the open menu on wide screens from the server's page", () => {
    expect(main).toContain("md:ml-[272px]");
    expect(main).not.toContain("margin-left");
  });

  it("does not slide on the first paint", () => {
    expect(main).not.toContain("transition");
  });
});
