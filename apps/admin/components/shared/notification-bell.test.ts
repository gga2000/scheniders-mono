import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The bell in the top bar is an icon with no words, so a screen reader said
 * only "button". It now says what it is, and how many things wait.
 */

let topups: unknown[];
let topupsFailed: boolean;
vi.mock("./topup-requests-section", () => ({
  TopupRequestsSection: () => null,
  useTopupRequests: () => (topupsFailed ? { data: undefined, isError: true } : { data: topups, isError: false }),
}));
vi.mock("./prime-link-requests-section", () => ({ PrimeLinkRequestsSection: () => null, usePrimeLinkRequests: () => ({ data: [] }) }));
vi.mock("./whatsapp-health-alert", () => ({
  WhatsAppHealthAlert: () => null,
  WhatsAppPausedAlert: () => null,
  useWhatsAppHealth: () => ({ data: { interaktEmpty: false, pausedShops: 0 } }),
}));
vi.mock("./billing-check-alert", () => ({ BillingCheckAlert: () => null, billingCheckCount: () => 0, useBillingCheck: () => ({ data: undefined }) }));

vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ user: { id: "user-noor" } }) }));

const { NotificationBell, uncheckedAlarms } = await import("./notification-bell");

const bell = () => {
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(NotificationBell)));
  return html.match(/<button[^>]*>/)?.[0] ?? "";
};

beforeEach(() => {
  topups = [];
  topupsFailed = false;
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

  it("counts a check whose read failed, so the bell is not quiet when its alarms cannot show", () => {
    topupsFailed = true;
    expect(bell()).toContain('aria-label="Notifications, 1 new"');
  });
});

describe("checks whose read failed", () => {
  const read = (isError: boolean, isFetching = false) => ({ isError, isFetching, refetch: vi.fn(async () => undefined) });

  it("names only the failed ones, and asks only those again", () => {
    const billing = read(true);
    const whatsapp = read(false);
    const prime = read(true, true);
    const unchecked = uncheckedAlarms([
      { name: "the billing job", read: billing },
      { name: "WhatsApp", read: whatsapp },
      { name: "Prime link requests", read: prime },
    ]);
    expect(unchecked.names).toEqual(["the billing job", "Prime link requests"]);
    expect(unchecked.retrying).toBe(true);
    unchecked.retry();
    expect(billing.refetch).toHaveBeenCalledTimes(1);
    expect(prime.refetch).toHaveBeenCalledTimes(1);
    expect(whatsapp.refetch).not.toHaveBeenCalled();
  });

  it("is empty when every check answered", () => {
    expect(uncheckedAlarms([{ name: "WhatsApp", read: read(false) }]).names).toEqual([]);
  });
});
