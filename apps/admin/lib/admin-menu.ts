/*
 * The console's menu: six places named in words, and Settings at the foot.
 *
 * It had fifteen links in two lists ("Navigation", "Analytics"), opened as
 * icons with no words, and called leads "Prospects". Pages that are opened
 * once a month sit one level down, under the place they belong to, and show
 * when that place is open: two clicks away, never gone. A page reached only by
 * typing its address (Lead numbers) is on the menu now.
 */

import { hasPermission } from "./admin-permissions";
import type { AdminAction, AdminRole } from "@/types/admin";

export type MenuIcon = "dashboard" | "merchants" | "leads" | "support" | "money" | "numbers" | "settings";

/** Work waiting on staff, counted beside a place on the menu. */
export type MenuCount = "leads" | "support" | "payments";

/** The badge beside a place: how many wait, or null when the count could not be read. */
export interface MenuBadge {
  count: number | null;
  label: string;
}

/**
 * One badge from its count's read. A failed count is not 0: the badge says
 * "?" so a queue does not look empty exactly when its read is failing.
 * `counted` follows the number ("3 receipts to check"); `queue` names what
 * could not be read ("Could not check the receipts").
 */
export function waitingBadge(
  read: { data: number | undefined; isError: boolean },
  counted: string,
  queue: string,
): MenuBadge {
  if (read.isError) return { count: null, label: `Could not check ${queue}` };
  const count = read.data ?? 0;
  return { count, label: `${count} ${counted}` };
}

export interface MenuLink {
  label: string;
  href: string;
  /** The step the page's read needs (lib/admin-permissions); a login without it is not shown the link. */
  needs?: AdminAction;
}

export interface MenuSection {
  label: string;
  /** Where a click on the place goes: its first page. */
  href: string;
  icon: MenuIcon;
  /** The pages under the place; empty when the place is one page. */
  links: MenuLink[];
  count?: MenuCount;
}

export const MENU: readonly MenuSection[] = [
  { label: "Dashboard", href: "/", icon: "dashboard", links: [] },
  {
    label: "Merchants",
    href: "/merchants",
    icon: "merchants",
    links: [
      { label: "All merchants", href: "/merchants" },
      { label: "Trials", href: "/trials" },
      { label: "Paying shops", href: "/paying" },
      { label: "Shops at risk", href: "/health" },
      // Fermi B12 item 6: about the fees we are owed, so admins only, as its read (api/delivered-rate-watch).
      { label: "Delivered rate", href: "/delivered-rate", needs: "manage_subscription" },
    ],
  },
  {
    label: "Leads",
    href: "/leads",
    icon: "leads",
    count: "leads",
    links: [
      { label: "All leads", href: "/leads" },
      { label: "Lead numbers", href: "/leads/analytics" },
    ],
  },
  { label: "Support", href: "/support", icon: "support", links: [], count: "support" },
  {
    label: "Money",
    href: "/payments",
    icon: "money",
    count: "payments",
    links: [
      { label: "Payments to check", href: "/payments" },
      // api/billing needs adjust_balance: support staff landed on "Your login cannot open the wallets".
      { label: "Wallets", href: "/billing", needs: "adjust_balance" },
      { label: "WhatsApp costs", href: "/whatsapp" },
    ],
  },
  {
    label: "Numbers",
    href: "/revenue",
    icon: "numbers",
    links: [
      { label: "Our fees", href: "/revenue" },
      { label: "Orders by hour", href: "/usage" },
      // Fermi B12 item 5: new shops, trials, first orders, paying and churn by Baghdad week.
      { label: "Weekly numbers", href: "/weekly-numbers" },
    ],
  },
];

export const SETTINGS_SECTION: MenuSection = {
  label: "Settings",
  href: "/settings",
  icon: "settings",
  links: [
    { label: "Settings", href: "/settings" },
    { label: "Team", href: "/team" },
    { label: "Activity log", href: "/activity" },
  ],
};

const ALL_SECTIONS: readonly MenuSection[] = [...MENU, SETTINGS_SECTION];

/**
 * The pages under a place that `role` may open. While the role is not known
 * yet every link shows, so a super admin's menu never grows under the
 * pointer; the page itself still says when a login cannot open it.
 */
export function linksFor(section: MenuSection, role: AdminRole | null): MenuLink[] {
  if (role === null) return section.links;
  return section.links.filter((link) => !link.needs || hasPermission(role, link.needs));
}

/** Whether `pathname` is `href` or a page inside it ("/merchants/123" is in "/merchants"). */
function within(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The page link that `pathname` is on: the longest match, so "/leads/analytics"
 * is Lead numbers and not All leads.
 */
export function activeLink(pathname: string): string | null {
  let best: string | null = null;
  for (const section of ALL_SECTIONS) {
    for (const href of [section.href, ...section.links.map((l) => l.href)]) {
      if (within(pathname, href) && (best === null || href.length > best.length)) best = href;
    }
  }
  return best;
}

/** The place on the menu that `pathname` belongs to, or null for a page off the menu. */
export function activeSection(pathname: string): MenuSection | null {
  const link = activeLink(pathname);
  if (link === null) return null;
  return ALL_SECTIONS.find((s) => s.href === link || s.links.some((l) => l.href === link)) ?? null;
}

/**
 * What the top bar and the browser tab call the page at `pathname`: the menu's
 * word for it ("Wallets", "Lead numbers"), the place's own name for its first
 * page ("Merchants", not "All merchants"), or null for a page off the menu.
 */
export function pageTitle(pathname: string): string | null {
  const link = activeLink(pathname);
  const section = activeSection(pathname);
  if (link === null || section === null) return null;
  if (link === section.href) return section.label;
  return section.links.find((l) => l.href === link)?.label ?? section.label;
}

/** Every page on the menu once, with the place it sits under: what the command palette lists. */
export function menuPages(role: AdminRole | null = null): { label: string; href: string; section: MenuSection }[] {
  const seen = new Set<string>();
  const pages: { label: string; href: string; section: MenuSection }[] = [];
  for (const section of ALL_SECTIONS) {
    for (const href of [section.href, ...linksFor(section, role).map((l) => l.href)]) {
      if (seen.has(href)) continue;
      seen.add(href);
      pages.push({ label: pageTitle(href) ?? section.label, href, section });
    }
  }
  return pages;
}
