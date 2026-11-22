// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Round 14 (new 7): with only the hourly jobs late, the open bell showed the
 * hourly row and, under it, "No notifications yet". The empty line now reads
 * the same alert rows as the count.
 */
vi.mock("./topup-requests-section", () => ({ TopupRequestsSection: () => null, useTopupRequests: () => ({ data: [] }) }));
vi.mock("./prime-link-requests-section", () => ({ PrimeLinkRequestsSection: () => null, usePrimeLinkRequests: () => ({ data: [] }) }));
vi.mock("./whatsapp-health-alert", () => ({
  WhatsAppHealthAlert: () => null,
  WhatsAppPausedAlert: () => null,
  useWhatsAppHealth: () => ({ data: undefined }),
}));
vi.mock("./billing-check-alert", () => ({ BillingCheckAlert: () => null, billingCheckCount: () => 0, useBillingCheck: () => ({ data: undefined }) }));
vi.mock("./hourly-jobs-alert", () => ({
  HourlyJobsAlert: () => createElement("p", null, "The hourly jobs did not run."),
  hourlyJobsCount: () => 1,
  useHourlyJobs: () => ({ data: { late: 1 } }),
}));
vi.mock("@/hooks/use-recent-steps", () => ({ useRecentSteps: () => ({ data: [], isError: false, isPending: false, isFetching: false }) }));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ user: { id: "user-noor" } }) }));

const { NotificationBell } = await import("./notification-bell");

afterEach(cleanup);

describe("the open bell with only the hourly jobs late", () => {
  it("shows the hourly row and counts it, with no 'No notifications yet' under it", () => {
    render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(NotificationBell)));
    fireEvent.click(screen.getByRole("button", { name: /^Notifications/ }));
    expect(screen.getByText("The hourly jobs did not run.")).toBeTruthy();
    expect(screen.queryByText("No notifications yet")).toBeNull();
    expect(screen.getByRole("button", { name: "Notifications, 1 new" })).toBeTruthy();
  });
});
