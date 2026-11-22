// @vitest-environment jsdom
// The trial and month card, rendered to markup: only a super admin gets the
// renewal switch; support staff read whether renewal is on. The switch used to
// show for everyone and answer "Forbidden" to support staff.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { cleanup, fireEvent, render as draw, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminRole } from "@/types/admin";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import type { BillingLockSnapshot } from "@/lib/billing-lock-tools";
import { shopActionKey } from "@/lib/shop-actions";

const auth: { role: AdminRole | null } = { role: "super_admin" };
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role: auth.role }) }));
const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));

const { SubscriptionCard } = await import("./subscription-card");

afterEach(() => {
  cleanup();
  send.mockReset();
});

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
      createElement(SubscriptionCard, { merchantId: "t1", tenant: shop, subscription, billingLock: null, walletIqd: 0 }),
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

  it("asks nothing until the switch is pressed", () => {
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

describe("SubscriptionCard on a paused trial", () => {
  // A paused trial is still a trial (lib/effective-status): its end day stands,
  // and it has no paid month yet. The card showed "This month" instead.
  it("shows when the trial ends and no month", () => {
    const paused = {
      ...tenant,
      status: "limited",
      trial_ends_at: "2026-11-20T09:00:00Z",
      restrictions: { status_before: "trial", paused_until: "2026-11-19T09:00:00Z" },
    } as MerchantDetail["tenant"];
    const html = render("super_admin", paused);
    expect(html).toContain("Trial ends");
    expect(html).not.toContain("This month");
  });

  it("shows a paused paying shop's month, as before", () => {
    const paused = { ...tenant, status: "limited", restrictions: { status_before: "active" } } as MerchantDetail["tenant"];
    const html = render("super_admin", paused);
    expect(html).toContain("This month");
    expect(html).not.toContain("Trial ends");
  });

  it("says a paused shop is not charged until the pause lifts", () => {
    const paused = { ...tenant, status: "limited", restrictions: { status_before: "active" } } as MerchantDetail["tenant"];
    expect(render("super_admin", paused)).toContain("On: not charged while paused, then charges the wallet each month");
  });

  // Round 19 (UX new 4): a year of free time read "This month Thu 19 Nov to Fri 19 Nov 2027".
  it("names a period longer than a month This period", () => {
    auth.role = "super_admin";
    const year = { ...subscription, current_period_start: "2026-11-19T00:00:00+00:00", current_period_end: "2027-11-19T00:00:00+00:00" } as MerchantDetail["subscription"];
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client: new QueryClient() }, createElement(SubscriptionCard, { merchantId: "t1", tenant, subscription: year, billingLock: null, walletIqd: 0 })),
    );
    expect(html).toContain("This period");
    expect(html).not.toContain("This month");
    expect(render("super_admin")).toContain("This month");
  });
});

/*
 * Round 21 (UX new 2 and 3): one click on the switch turned renewal back on,
 * with no sentence and no reason. Since renewal off locks the shop and turning
 * it on charges the month within the hour (20261119073654), a stray click took
 * the month from a shop whose renewal was stopped on purpose. And the switch
 * did not wait for the page's other writes.
 */
describe("SubscriptionCard turning renewal back on", () => {
  const LOCK: BillingLockSnapshot = {
    locked: true,
    reason: "unpaid",
    since: "2026-11-21T00:00:00+00:00",
    orders_left: 50,
    allowance: 50,
    plan: "starter",
    price_iqd: 9000,
    renewal_off: true,
  };
  const off = { ...subscription, auto_renew: false, status: "past_due" } as MerchantDetail["subscription"];

  /** A write on this shop from another panel, held open until the test ends. */
  function OtherWrite() {
    const write = useMutation({ mutationKey: shopActionKey("t1"), mutationFn: () => new Promise<never>(() => {}) });
    return createElement("button", { type: "button", onClick: () => write.mutate() }, "Other write");
  }

  const open = (walletIqd: number, billingLock: BillingLockSnapshot | null = LOCK, subs = off) => {
    auth.role = "super_admin";
    draw(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(SubscriptionCard, { merchantId: "t1", tenant, subscription: subs, billingLock, walletIqd }),
        createElement(OtherWrite),
      ),
    );
    return screen.getByRole("switch", { name: "Renew each month" });
  };

  it("says a locked shop's wallet pays the month within the hour, and sends nothing on the click", () => {
    fireEvent.click(open(20000));
    expect(
      screen.getByText(
        "Renewal turns on. Within the hour the wallet pays 9,000 IQD for the month and the shop opens. The wallet holds 20,000 IQD now.",
      ),
    ).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it("says when the wallet is short of the month", () => {
    fireEvent.click(open(4000));
    expect(
      screen.getByText(
        "Renewal turns on. The wallet holds 4,000 IQD, short of the month's 9,000 IQD. Once it holds the month, it pays and the shop opens.",
      ),
    ).toBeTruthy();
  });

  it("waits for a reason, then sends it with the change", async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    fireEvent.click(open(20000));
    const go = screen.getByRole("button", { name: "Turn renewal on" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Why turn renewal on? (the shop's timeline shows it)"), {
      target: { value: "Owner paid in cash at the office" },
    });
    fireEvent.click(go);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const [url, init] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/merchants/t1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ auto_renew: true, reason: "Owner paid in cash at the office" });
  });

  it("asks why before a shop that is not locked turns renewal on, too", () => {
    fireEvent.click(open(0, null, { ...off, status: "active" } as MerchantDetail["subscription"]));
    expect(screen.getByText("Renewal turns on. The month after Tue 1 Dec is charged from the wallet as usual.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Turn renewal on" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("waits while another write on this shop runs", () => {
    const toggle = open(20000) as HTMLButtonElement;
    fireEvent.click(toggle);
    fireEvent.change(screen.getByPlaceholderText("Why turn renewal on? (the shop's timeline shows it)"), {
      target: { value: "Owner paid in cash at the office" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Other write" }));
    return waitFor(() => {
      expect(toggle.disabled).toBe(true);
      expect((screen.getByRole("button", { name: "Turn renewal on" }) as HTMLButtonElement).disabled).toBe(true);
      // The reason box sits in the panel's fieldset, which the browser disables as a whole.
      expect(screen.getByPlaceholderText("Why turn renewal on? (the shop's timeline shows it)").matches(":disabled")).toBe(true);
    });
  });
});

/*
 * Round 22 (structure new 3): the panel worked out its step from the switch on
 * each draw. Staff pressed Stop renewing, the answer was lost, and the re-read
 * showed renewal off: the open panel turned into "Turn renewal on" with the
 * reason still filled in, so one more press undid the stop and charged a
 * locked shop's month.
 */
describe("SubscriptionCard after a lost answer", () => {
  const REASON = "Owner asked to stop at the end of the month";
  const lost = () => Promise.resolve(new Response("upstream timed out", { status: 504 }));

  function Card({ on }: { on: boolean }) {
    return createElement(SubscriptionCard, {
      merchantId: "t1",
      tenant,
      subscription: { ...subscription, auto_renew: on } as MerchantDetail["subscription"],
      billingLock: null,
      walletIqd: 0,
    });
  }

  const pressStop = async () => {
    auth.role = "super_admin";
    send.mockImplementation(lost);
    const client = new QueryClient();
    const view = draw(createElement(QueryClientProvider, { client }, createElement(Card, { on: true })));
    fireEvent.click(screen.getByRole("switch", { name: "Renew each month" }));
    fireEvent.change(screen.getByPlaceholderText("Why stop renewing? (the shop's timeline shows it)"), {
      target: { value: REASON },
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop renewing" }));
    await screen.findByText(/No answer came back/);
    return (on: boolean) => view.rerender(createElement(QueryClientProvider, { client }, createElement(Card, { on })));
  };

  it("closes the panel when the shop, read again, shows renewal stopped", async () => {
    const reread = await pressStop();
    reread(false);
    expect(screen.queryByRole("button", { name: "Turn renewal on" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop renewing" })).toBeNull();
    expect(screen.queryByDisplayValue(REASON)).toBeNull();
    expect(screen.getByRole("switch", { name: "Renew each month" }).getAttribute("aria-checked")).toBe("false");
  });

  it("keeps asking the same step, reason kept, when the shop still renews", async () => {
    const reread = await pressStop();
    reread(true);
    expect(screen.getByDisplayValue(REASON)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn renewal on" })).toBeNull();
    send.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Stop renewing" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const [, init] = send.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ auto_renew: false, reason: REASON });
  });
});
