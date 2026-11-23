// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * The page's room for the fixed menu started at 0 px and slid to 272 px for
 * half a second after every load, pushing the whole page sideways (layout
 * shift 0.17 to 0.33 on every page). The server's page must already have it.
 */

const { Nothing, signOut, push } = vi.hoisted(() => ({
  Nothing: () => null,
  signOut: vi.fn(async () => undefined),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/merchants" }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ user: null, profile: null, role: null, signOut }),
}));
// The menu's own Sign out button, so the shell's answer to it can be pressed.
vi.mock("./admin-sidebar", () => ({
  AdminSidebar: ({ onSignOut }: { onSignOut: () => void }) => createElement("button", { type: "button", onClick: onSignOut }, "Sign out"),
}));
vi.mock("./admin-topbar", () => ({ AdminTopbar: Nothing }));
vi.mock("@/components/shared/command-palette", () => ({
  CommandPalette: Nothing,
  useCommandPalette: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));
vi.mock("@/components/merchants/watchlist-sync", () => ({ WatchlistSync: Nothing }));

const { AdminShell } = await import("./admin-shell");
const { holdLeaveGuard, SIGN_OUT_QUESTION } = await import("@/hooks/use-leave-guard");

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

  // Every page change used to fade out for 200 ms and in for 350 ms, one after
  // the other, before staff saw the page (Ali, 19 Nov: drop the fade).
  it("shows the page at once, with no fade", () => {
    expect(html).toContain("page");
    expect(html).not.toMatch(/opacity:\s*0/);
  });
});

/*
 * Round 25 (structure new 6): Sign out asks first while a product import
 * holds the tab (#1626), but only `mayStopHeldWork` was tested, so deleting
 * the shell's call to it passed every suite.
 */
describe("AdminShell Sign out while an import runs in the tab", () => {
  afterEach(() => {
    cleanup();
    signOut.mockClear();
    push.mockClear();
    vi.restoreAllMocks();
  });

  it("asks first, and Cancel signs nothing out", async () => {
    const release = holdLeaveGuard();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(createElement(AdminShell, null, "page"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
    expect(confirm).toHaveBeenCalledWith(SIGN_OUT_QUESTION);
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/login");
    release();
  });

  it("signs out at once when nothing holds the tab", async () => {
    const confirm = vi.spyOn(window, "confirm");
    render(createElement(AdminShell, null, "page"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
    expect(confirm).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
