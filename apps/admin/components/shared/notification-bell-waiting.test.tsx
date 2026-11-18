// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Round 16 (Data new 3): since #1447 the bell's own read waits for the page's
 * reads (hooks/use-after-page-reads.ts). A read that waits is pending but not
 * loading, so the open bell said "No notifications yet" over a full staff log.
 */
vi.mock("./topup-requests-section", () => ({ TopupRequestsSection: () => null, useTopupRequests: () => ({ data: undefined }) }));
vi.mock("./prime-link-requests-section", () => ({ PrimeLinkRequestsSection: () => null, usePrimeLinkRequests: () => ({ data: undefined }) }));
vi.mock("./whatsapp-health-alert", () => ({
  WhatsAppHealthAlert: () => null,
  WhatsAppPausedAlert: () => null,
  useWhatsAppHealth: () => ({ data: undefined }),
}));
vi.mock("./billing-check-alert", () => ({ BillingCheckAlert: () => null, billingCheckCount: () => 0, useBillingCheck: () => ({ data: undefined }) }));
vi.mock("./hourly-jobs-alert", () => ({ HourlyJobsAlert: () => null, hourlyJobsCount: () => 0, useHourlyJobs: () => ({ data: undefined }) }));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ user: { id: "user-noor" } }) }));

const { NotificationBell } = await import("./notification-bell");

afterEach(cleanup);

describe("the open bell while its read waits for the page", () => {
  it("says it is loading, not that nothing happened", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    // No page read has landed, so the bell's read is still switched off.
    render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(NotificationBell)));
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(screen.queryByText("No notifications yet")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });
});
