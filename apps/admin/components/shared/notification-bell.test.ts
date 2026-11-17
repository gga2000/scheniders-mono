import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The bell in the top bar is an icon with no words, so a screen reader said
 * only "button". It now says what it is, and how many things wait.
 */

let topups: unknown[];
vi.mock("./topup-requests-section", () => ({ TopupRequestsSection: () => null, useTopupRequests: () => ({ data: topups }) }));
vi.mock("./prime-link-requests-section", () => ({ PrimeLinkRequestsSection: () => null, usePrimeLinkRequests: () => ({ data: [] }) }));
vi.mock("./whatsapp-health-alert", () => ({
  WhatsAppHealthAlert: () => null,
  WhatsAppPausedAlert: () => null,
  useWhatsAppHealth: () => ({ data: { interaktEmpty: false, pausedShops: 0 } }),
}));
vi.mock("./billing-check-alert", () => ({ BillingCheckAlert: () => null, billingCheckCount: () => 0, useBillingCheck: () => ({ data: undefined }) }));

const { NotificationBell } = await import("./notification-bell");

const bell = () => {
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(NotificationBell)));
  return html.match(/<button[^>]*>/)?.[0] ?? "";
};

beforeEach(() => {
  topups = [];
});

describe("the notification bell", () => {
  it("is named when nothing waits", () => {
    expect(bell()).toContain('aria-label="Notifications"');
    expect(bell()).toContain('aria-expanded="false"');
  });

  it("says how many things wait", () => {
    topups = [{ id: "t1" }, { id: "t2" }];
    expect(bell()).toContain('aria-label="Notifications, 2 new"');
  });
});
