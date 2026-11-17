// The trial and month card, rendered to markup: only a super admin gets the
// renewal switch; support staff read whether renewal is on. The switch used to
// show for everyone and answer "Forbidden" to support staff.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { AdminRole } from "@/types/admin";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

const auth: { role: AdminRole | null } = { role: "super_admin" };
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role: auth.role }) }));

const { SubscriptionCard } = await import("./subscription-card");

const tenant = { status: "active", plan: "starter", trial_ends_at: null } as unknown as MerchantDetail["tenant"];
const subscription = {
  auto_renew: true,
  current_period_start: "2026-11-01T00:00:00+00:00",
  current_period_end: "2026-12-01T00:00:00+00:00",
} as unknown as MerchantDetail["subscription"];

const render = (role: AdminRole | null, shop: MerchantDetail["tenant"] = tenant) => {
  auth.role = role;
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(SubscriptionCard, { merchantId: "t1", tenant: shop, subscription }),
    ),
  );
};

describe("SubscriptionCard renewal", () => {
  it("gives a super admin the switch", () => {
    const html = render("super_admin");
    expect(html).toContain('role="switch"');
    expect(html).toContain("On: charges the wallet each month");
  });

  it("shows support staff whether renewal is on, with no switch", () => {
    const html = render("support_staff");
    expect(html).not.toContain('role="switch"');
    expect(html).toContain("On: charges the wallet each month");
  });

  it("asks nothing until the switch is pressed: the reason form opens only to stop renewing", () => {
    const html = render("super_admin");
    expect(html).not.toContain('aria-label="Reason"');
    expect(html).not.toContain("Stop renewing");
  });

  it("shows no switch before the role is known", () => {
    expect(render(null)).not.toContain('role="switch"');
  });
});

describe("SubscriptionCard on the demo store", () => {
  // The status line says the demo store is never charged; the renewal line
  // below said "charges the wallet each month". The renewal takes 0.
  it("says its month renews at no charge", () => {
    const html = render("super_admin", { ...tenant, is_demo: true } as MerchantDetail["tenant"]);
    expect(html).toContain("On: renews each month, never charged (demo store)");
    expect(html).not.toContain("charges the wallet");
  });
});
