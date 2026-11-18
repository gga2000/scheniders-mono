import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MENU_BEFORE_PAINT, MENU_KEY, readMenuCollapsed, writeMenuCollapsed } from "./menu-choice";

/*
 * Staff who chose an icons-only menu saw every page jump 184px sideways when
 * the app came alive: the page is built with the full menu, and the choice
 * was read only after the first paint. The script marks <html> first, and
 * CSS gives the page the narrow menu's room.
 */

function fakeBrowser(saved: string | null | "refuses") {
  const store = new Map<string, string>();
  if (saved !== null && saved !== "refuses") store.set(MENU_KEY, saved);
  const localStorage = {
    getItem: (key: string) => {
      if (saved === "refuses") throw new Error("SecurityError");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => void store.set(key, value),
  };
  const document = { documentElement: { dataset: {} as Record<string, string | undefined> } };
  return { localStorage, document, store };
}

function runBeforePaint(saved: string | null | "refuses") {
  const browser = fakeBrowser(saved);
  new Function("localStorage", "document", MENU_BEFORE_PAINT)(browser.localStorage, browser.document);
  return browser.document.documentElement.dataset.menu;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the menu choice before the first paint", () => {
  it("marks the page for someone who chose icons", () => {
    expect(runBeforePaint("true")).toBe("icons");
  });

  it("leaves the full menu for everyone else", () => {
    expect(runBeforePaint("false")).toBeUndefined();
    expect(runBeforePaint(null)).toBeUndefined();
  });

  it("opens with the full menu when the browser refuses storage", () => {
    expect(runBeforePaint("refuses")).toBeUndefined();
  });
});

describe("changing the menu", () => {
  it("saves the choice and moves the mark with it", () => {
    const browser = fakeBrowser(null);
    vi.stubGlobal("localStorage", browser.localStorage);
    vi.stubGlobal("document", browser.document);

    writeMenuCollapsed(true);
    expect(browser.store.get(MENU_KEY)).toBe("true");
    expect(browser.document.documentElement.dataset.menu).toBe("icons");
    expect(readMenuCollapsed()).toBe(true);

    writeMenuCollapsed(false);
    expect(browser.store.get(MENU_KEY)).toBe("false");
    expect(browser.document.documentElement.dataset).not.toHaveProperty("menu");
    expect(readMenuCollapsed()).toBe(false);
  });
});

describe("the CSS and the components agree", () => {
  const read = (file: string) => readFileSync(path.resolve(__dirname, "..", file), "utf8");
  const css = read("app/globals.css");
  const shell = read("components/layout/admin-shell.tsx");
  const sidebar = read("components/layout/admin-sidebar.tsx");
  const layout = read("app/layout.tsx");

  it("runs the script in the root layout", () => {
    expect(layout).toContain("__html: MENU_BEFORE_PAINT");
  });

  it("gives the page the room the shell gives an icons menu", () => {
    expect(shell).toContain("data-admin-main");
    expect(shell).toContain('isCollapsed ? "md:ml-[88px]"');
    expect(css).toMatch(/html\[data-menu="icons"\] \[data-admin-main\] \{ margin-left: 88px; \}/);
  });

  it("draws the menu at the icons menu's width until the app takes over", () => {
    expect(sidebar).toContain("data-admin-menu");
    expect(sidebar).toContain("data-collapsed={collapsed || undefined}");
    expect(sidebar).toContain('collapsed ? "w-[72px] px-2"');
    expect(css).toMatch(/html\[data-menu="icons"\] \[data-admin-menu\]:not\(\[data-collapsed\]\) \{ width: 72px; \}/);
  });
});
