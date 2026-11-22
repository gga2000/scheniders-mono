import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { hasPermission } from "@/lib/admin-permissions";
import { TRIAL_FOLLOW_UP_KEY, type TrialFollowUpRow } from "@/lib/trial-pipeline";
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
  trial_day: 4,
  paused: true,
};

function render(as: AdminRole, followUps?: TrialFollowUpRow[]): string {
  role = as;
  const client = new QueryClient();
  client.setQueryData(["admin", "trials"], {
    trials: [PAUSED_TRIAL],
    summary: { total: 1, expiringSoon: 1, expired: 0, healthy: 0 },
  });
  if (followUps) client.setQueryData(TRIAL_FOLLOW_UP_KEY, followUps);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(TrialsPage)));
}

const FOLLOW_UP: TrialFollowUpRow = {
  id: PAUSED_TRIAL.id,
  trial_day: 5,
  days_remaining: 3,
  is_expired: false,
  groups: ["paused"],
  follow_up: {
    tenant_id: PAUSED_TRIAL.id,
    owner_phone: "07701234567",
    orders: 4,
    delivered: 1,
    shipped: true,
    whatsapp_sent: 12,
    whatsapp_cap: 200,
    prime_linked: false,
    trial_check: null,
    trial_check_decision: null,
    lock_reason: null,
    last_call: null,
  },
};

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

// Fermi B12 item 1, concept A (Ali's pick, 22 Nov): chips above the list and
// one follow-up line under each shop; the row itself stays as it was.
describe("the trial bar on Trials", () => {
  it("scales to the trial's own 7 days and is amber in its last 3, not red", () => {
    const html = render("super_admin");
    expect(html).toMatch(/bg-amber-500 [^"]*" style="width:43%"/);
    expect(html).not.toContain("bg-red-500");
  });
});

describe("the follow-up line on Trials", () => {
  it("adds the chips and a line of facts under the unchanged row, with WhatsApp and Mark contacted", () => {
    const html = render("support_staff", [FOLLOW_UP]);
    for (const chip of ["All", "Day 1", "Day 3", "Ends today or tomorrow", "Locked", "Paused", "Not called"]) expect(html).toContain(`>${chip}<`);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Day <span");
    expect(html).toMatch(/Day <span[^>]*>5<\/span>/);
    expect(html).not.toContain("5 of");
    expect(html).toContain("4, 1 delivered");
    expect(html).toContain("12/200");
    expect(html).toContain('href="https://wa.me/9647701234567"');
    expect(html).toContain("WhatsApp owner");
    expect(html).toContain("Mark contacted");
    expect(html).toContain("Copy report for WhatsApp");
    // The row above it is as it was.
    expect(html).toContain("Paused: ask a super admin to lift it");
    expect(html).toContain("Najaf Gifts");
  });

  it("shows the list as it was while the follow-up facts are not read", () => {
    const html = render("support_staff");
    expect(html).not.toContain("Not called");
    expect(html).not.toContain("WhatsApp owner");
    expect(html).toContain("Najaf Gifts");
    expect(html).toContain("Paused: ask a super admin to lift it");
  });
});
