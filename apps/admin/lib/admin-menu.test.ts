import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MENU, SETTINGS_SECTION, activeLink, activeSection, linksFor, menuPages, pageTitle } from "./admin-menu";

/** Every page of the console, as a path ("/leads/analytics"); pages with an id are left out. */
function consolePages(dir = join(__dirname, "..", "app", "(dashboard)"), base = ""): string[] {
  const pages: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!name.startsWith("[")) pages.push(...consolePages(full, `${base}/${name}`));
    } else if (name === "page.tsx") {
      pages.push(base || "/");
    }
  }
  return pages;
}

describe("the console menu", () => {
  it("has six places named in words, and Settings at the foot", () => {
    expect(MENU.map((s) => s.label)).toEqual(["Dashboard", "Merchants", "Leads", "Support", "Money", "Numbers"]);
    expect(SETTINGS_SECTION.label).toBe("Settings");
  });

  it("calls leads Leads, never Prospects", () => {
    const words = [...MENU, SETTINGS_SECTION].flatMap((s) => [s.label, ...s.links.map((l) => l.label)]);
    expect(words.join(" ")).not.toMatch(/prospect/i);
  });

  it("reaches every page of the console", () => {
    const linked = new Set([...MENU, SETTINGS_SECTION].flatMap((s) => [s.href, ...s.links.map((l) => l.href)]));
    const missing = consolePages().filter((page) => !linked.has(page));
    expect(missing).toEqual([]);
  });

  it("opens each place on its first page", () => {
    for (const section of [...MENU, SETTINGS_SECTION]) {
      if (section.links.length > 0) expect(section.links[0]?.href).toBe(section.href);
    }
  });

  it("knows which place and page a path is on", () => {
    expect(activeSection("/")?.label).toBe("Dashboard");
    expect(activeSection("/merchants/0b6f")?.label).toBe("Merchants");
    expect(activeSection("/trials")?.label).toBe("Merchants");
    expect(activeLink("/leads/analytics")).toBe("/leads/analytics");
    expect(activeLink("/leads/0b6f")).toBe("/leads");
    expect(activeSection("/whatsapp")?.label).toBe("Money");
    expect(activeSection("/team/0b6f")?.label).toBe("Settings");
    expect(activeSection("/login")).toBeNull();
  });

  it("names each page in the menu's words", () => {
    expect(pageTitle("/")).toBe("Dashboard");
    expect(pageTitle("/merchants")).toBe("Merchants");
    expect(pageTitle("/merchants/0b6f")).toBe("Merchants");
    expect(pageTitle("/billing")).toBe("Wallets");
    expect(pageTitle("/leads")).toBe("Leads");
    expect(pageTitle("/leads/analytics")).toBe("Lead numbers");
    expect(pageTitle("/activity")).toBe("Activity log");
    expect(pageTitle("/login")).toBeNull();
  });
});

describe("links each login may open", () => {
  const money = MENU.find((s) => s.label === "Money");
  if (!money) throw new Error("no Money place");
  const labels = (role: Parameters<typeof linksFor>[1]) => linksFor(money, role).map((l) => l.label);

  it("leaves Wallets off the menu for support staff, whose login cannot read the wallets", () => {
    expect(labels("support_staff")).toEqual(["Payments to check", "WhatsApp costs"]);
    expect(menuPages("support_staff").map((p) => p.href)).not.toContain("/billing");
  });

  it("shows every link to a super admin, and while the role is still loading", () => {
    expect(labels("super_admin")).toEqual(["Payments to check", "Wallets", "WhatsApp costs"]);
    expect(labels(null)).toEqual(labels("super_admin"));
    expect(menuPages().map((p) => p.href)).toContain("/billing");
  });
});
