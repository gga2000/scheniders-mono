import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasPermission } from "@/lib/admin-permissions";
import type { AdminAction, AdminRole } from "@/types/admin";

/*
 * Support staff saw plan and status menus, Top Up, Extend Trial and Change
 * Plan on the Merchants page; each ended in a 403 after they had filled it
 * in. The controls now follow the same permission table as the server.
 */

let role: AdminRole;
vi.mock("@/hooks/use-admin-auth", () => ({
  useCan: () => (action: AdminAction) => hasPermission(role, action),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const { MerchantPlanDropdown } = await import("./merchant-plan-dropdown");
const { MerchantStatusDropdown } = await import("./merchant-status-dropdown");
const { MerchantBulkBar } = await import("./merchant-bulk-bar");

const render = (element: ReactElement) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, element));

const buttonLabels = (html: string) =>
  [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

const SHOP = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";

describe("merchant controls follow the role", () => {
  beforeEach(() => {
    role = "super_admin";
  });

  it("offers plan and status to a super admin", () => {
    expect(render(createElement(MerchantPlanDropdown, { merchantId: SHOP, plan: "starter" }))).toContain("<button");
    expect(render(createElement(MerchantStatusDropdown, { merchantId: SHOP, status: "active", trialSubscription: false }))).toContain("<button");
  });

  it("shows plan and status to support staff without offering a change", () => {
    role = "support_staff";
    const plan = render(createElement(MerchantPlanDropdown, { merchantId: SHOP, plan: "starter" }));
    const status = render(createElement(MerchantStatusDropdown, { merchantId: SHOP, status: "active", trialSubscription: false }));

    expect(plan).not.toContain("<button");
    expect(plan).toContain("Starter");
    expect(status).not.toContain("<button");
    expect(status).toContain("Active");
  });

  it("gives a super admin every bulk action", () => {
    const html = render(createElement(MerchantBulkBar, { selectedCount: 5, onClearSelection: () => {}, onBulkAction: () => {} }));
    expect(buttonLabels(html)).toEqual(["", "Top Up", "Extend Trial", "Export", "Change Plan"]);
  });

  it("gives support staff only what the server lets them do", () => {
    role = "support_staff";
    const html = render(createElement(MerchantBulkBar, { selectedCount: 3, onClearSelection: () => {}, onBulkAction: () => {} }));
    expect(buttonLabels(html)).toEqual(["", "Compare", "Export"]);
  });
});
