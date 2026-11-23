import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { AdminEmployee } from "@/types/leads";

/*
 * Round 23 (UX new 2): the team reads again when staff come back to the tab,
 * and a failed read kept the last people and numbers with nothing to say
 * they may be old.
 */

vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ role: "super_admin" }),
  useCan: () => () => true,
}));

const { default: TeamPage } = await import("./page");

const KARRAR: AdminEmployee = {
  id: "u1",
  email: "karrar@example.com",
  display_name: "Karrar",
  avatar_url: null,
  role: "support_staff",
  is_active: true,
  last_login_at: null,
  leads_added: 12,
  leads_converted: 3,
  stores_built: 2,
  total_actions: 40,
  commission_earned: 0,
  commission_pending: 0,
  achievements: [],
};

function render(refreshFailed: boolean): string {
  const client = new QueryClient();
  client.setQueryData(["admin-team"], [KARRAR]);
  if (refreshFailed) {
    // Read at 20:00 in Baghdad, then the read on coming back failed.
    client.getQueryCache().find({ queryKey: ["admin-team"] })?.setState({
      status: "error",
      error: new TypeError("Failed to fetch"),
      dataUpdatedAt: Date.parse("2026-11-22T17:00:00Z"),
    });
  }
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(TeamPage)));
}

describe("Team after a failed read again", () => {
  it("keeps the people and says how old the list is", () => {
    const html = render(true);
    expect(html).toMatch(/Could not refresh the team\. This list is from (Sun 22 Nov, )?20:00\./);
    expect(html).toContain("1 employee");
  });

  it("says nothing extra after a good read", () => {
    expect(render(false)).not.toContain("Could not refresh");
  });
});
