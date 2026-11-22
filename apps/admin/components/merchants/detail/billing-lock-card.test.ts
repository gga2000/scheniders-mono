// @vitest-environment jsdom
// The staff card for a locked store (Fermi A1), rendered to markup: what the
// lock is, the storefront orders left, and the tools staff may use.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { cleanup, fireEvent, render as draw, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BillingLockSnapshot } from "@/lib/billing-lock-tools";
import { shopActionKey } from "@/lib/shop-actions";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));
const { BillingLockCard } = await import("./billing-lock-card");

afterEach(() => {
  cleanup();
  send.mockReset();
  localStorage.clear();
});

/** A shop id as the database makes them: the request key takes no other. */
const SHOP_ID = "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d";

const LOCK: BillingLockSnapshot = {
  locked: true,
  reason: "unpaid",
  since: "2026-11-10T00:00:00+00:00",
  orders_left: 0,
  allowance: 50,
  plan: "starter",
  price_iqd: 25000,
  renewal_off: false,
};

const render = (canForceUnlock: boolean, lock: BillingLockSnapshot = LOCK, shopPaused = false) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(BillingLockCard, { merchantId: SHOP_ID, lock, canForceUnlock, shopPaused }),
    ),
  );

describe("BillingLockCard", () => {
  it("says why the store is locked, what paying costs and that the storefront paused", () => {
    const html = render(true);
    expect(html).toContain("Month not paid");
    expect(html).toContain("25,000 IQD");
    expect(html).toContain("Storefront paused");
    expect(html).toMatch(/0<span[^>]*>\/ 50<\/span>/);
  });

  it("shows the orders left while the storefront still takes orders", () => {
    const html = render(true, { ...LOCK, reason: "trial_ended", orders_left: 12 });
    expect(html).toContain("Trial ended, not paid");
    expect(html).toContain("Then the storefront pauses");
  });

  it("on a paused shop, says paying opens it once the pause lifts and offers no free unlock the database would refuse", () => {
    const html = render(true, LOCK, true);
    expect(html).toContain("Paused, so the lock stays until the pause lifts. Then paying 25,000 IQD from the wallet opens it.");
    expect(html).not.toContain("Unlock for");
    expect(html).toContain("Unlock free works once the pause lifts.");
    expect(render(true)).toContain("Paying 25,000 IQD from the wallet opens it again.");
  });

  it("with renewal off, says money alone does not open it, and how it opens", () => {
    // Round 20 (Fermi's rule, 20261119073654): no wallet credit, approved
    // receipt or hourly run charges a month that ended with renewal off.
    const html = render(true, { ...LOCK, renewal_off: true });
    expect(html).toContain(
      "Renewal is off, so money alone does not open it: it opens when the shop pays 25,000 IQD on its lock screen, or staff turn renewal on and the wallet pays it.",
    );
    expect(html).not.toContain("from the wallet opens it");
    expect(render(true, { ...LOCK, renewal_off: true }, true)).toContain("Paused, and renewal is off. Once the pause lifts, it opens when the shop pays");
  });

  // Round 21 (data new 1): the free unlock's note said renewal charges the wallet as usual when it
  // ends. admin_force_unlock leaves renewal off, so the shop locks again, uncharged.
  it("with renewal off, says the shop locks again when the free unlock ends", () => {
    const html = render(true, { ...LOCK, renewal_off: true });
    expect(html).toContain("Opens free time with no wallet charge. Renewal is off, so the shop locks again when that time ends.");
    expect(html).toContain("A free unlock or free days also open it, with no charge, for that time only.");
    expect(html).not.toContain("renewal charges the wallet as usual");
    expect(render(true)).toContain("Opens free time with no wallet charge. When it ends, renewal charges the wallet as usual.");
    expect(render(false, { ...LOCK, reason: "trial_ended", renewal_off: true })).not.toContain("A free unlock or free days");
  });

  it("offers the free unlock to super admins only", () => {
    expect(render(true)).toContain("Unlock for 30 days");
    expect(render(false)).not.toContain("Unlock for");
  });

  it("lets support staff give orders at the end of a trial, but not to a store that did not pay its month", () => {
    const trial = render(false, { ...LOCK, reason: "trial_ended" });
    expect(trial).toContain("Give more store orders");
    expect(trial).not.toContain("from a super admin");

    const unpaid = render(false);
    expect(unpaid).not.toContain("Give more store orders");
    expect(unpaid).toContain("gets more orders or a free unlock from a super admin");

    expect(render(true)).toContain("Give more store orders");
  });

  it("keeps every tool off until a reason is written", () => {
    const html = render(true);
    // The order presets (+10, +25, +50), the custom grant and the unlock.
    const tools = (html.match(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g) ?? []).filter(
      (b) => />\+ (10|25|50)<\/button>$/.test(b) || b.includes("Give these store orders") || b.includes("Unlock for"),
    );
    expect(tools).toHaveLength(5);
    for (const button of tools) expect(button).toMatch(/disabled=""/);
  });
});

/*
 * Round 21 (UX new 3): the card's tools did not wait for the page's writes. A
 * click on + 10 during a held Add money sent a second write, and during the
 * card's own unlock the 7 or 30 choice still changed, so the button named 7
 * days while 30 were written.
 */
describe("BillingLockCard while a write on the shop runs", () => {
  const REASON = "Owner paid in cash at the office";

  /** A write on this shop from another panel, held open until the test ends. */
  function OtherWrite() {
    const write = useMutation({ mutationKey: shopActionKey(SHOP_ID), mutationFn: () => new Promise<never>(() => {}) });
    return createElement("button", { type: "button", onClick: () => write.mutate() }, "Other write");
  }

  const drawCard = () => {
    draw(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(BillingLockCard, { merchantId: SHOP_ID, lock: LOCK, canForceUnlock: true, shopPaused: false }),
        createElement(OtherWrite),
      ),
    );
    fireEvent.change(screen.getByPlaceholderText("Why? (needed for both tools, saved in the log)"), { target: { value: REASON } });
  };
  const off = (name: string) => screen.getByRole("button", { name }).matches(":disabled");

  it("holds every tool while another panel's write runs, and sends nothing", async () => {
    drawCard();
    expect(off("+ 10")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Other write" }));
    await waitFor(() => expect(off("+ 10")).toBe(true));
    expect(off("7 days")).toBe(true);
    expect(off("Unlock for 30 days")).toBe(true);
    expect(screen.getByPlaceholderText("Why? (needed for both tools, saved in the log)").matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "+ 10" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps the days it is writing: the 7 or 30 choice waits during its own unlock", async () => {
    send.mockReturnValue(new Promise<never>(() => {}));
    drawCard();
    fireEvent.click(screen.getByRole("button", { name: "Unlock for 30 days" }));
    // A disabled control takes no click in the browser, so the button keeps naming what is written.
    await waitFor(() => expect(off("7 days")).toBe(true));
    expect(off("30 days")).toBe(true);
    expect(screen.getByRole("button", { name: "Unlock for 30 days" })).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
