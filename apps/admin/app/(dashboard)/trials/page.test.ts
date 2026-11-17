import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { hasPermission } from "@/lib/admin-permissions";
import type { AdminAction, AdminRole } from "@/types/admin";

/*
 * Round 12 (reliability new 10). A paused trial cannot be given days until
 * its pause is lifted, and Trials sent everyone to the shop page to lift it.
 * Support staff may not lift a pause and find no button there, so they are
 * told whom to ask instead.
 */

let role: AdminRole;
vi.mock("@/hooks/use-admin-auth", () => ({
  useCan: () => (action: AdminAction) => hasPermission(role, action),
}));
vi.mock("@/components/trials/trial-checks-panel", () => ({ TrialChecksPanel: () => null }));

const { default: TrialsPage } = await import("./page");

const PAUSED_TRIAL = {
  id: "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f",
  business_name: "Najaf Gifts",
  slug: "najaf-gifts",
  plan: "starter",
  status: "limited",
  trial_ends_at: "2026-11-20T09:00:00.000Z",
  city: "Najaf",
  contact_email: null,
  created_at: "2026-11-13T09:00:00.000Z",
  balance_iqd: 0,
  days_remaining: 3,
  is_expired: false,
  paused: true,
};

function render(as: AdminRole): string {
  role = as;
  const client = new QueryClient();
  client.setQueryData(["admin", "trials"], {
    trials: [PAUSED_TRIAL],
    summary: { total: 1, expiringSoon: 1, expired: 0, healthy: 0 },
  });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(TrialsPage)));
}

describe("a paused trial on Trials", () => {
  it("sends staff who may lift the pause to the shop page", () => {
    const html = render("super_admin");
    expect(html).toContain(`href="/merchants/${PAUSED_TRIAL.id}"`);
    expect(html).toContain("Paused: lift it to give days");
    expect(html).not.toContain("Extend");
  });

  it("tells support staff, who cannot lift it, whom to ask", () => {
    const html = render("support_staff");
    expect(html).toContain("Paused: ask a super admin to lift it");
    expect(html).not.toContain("Paused: lift it to give days");
    expect(html).not.toContain("Extend");
  });
});
