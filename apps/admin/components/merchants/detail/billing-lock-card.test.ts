// The staff card for a locked store (Fermi A1), rendered to markup: what the
// lock is, the storefront orders left, and the tools staff may use.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { BillingLockCard } from "./billing-lock-card";
import type { BillingLockSnapshot } from "@/lib/billing-lock-tools";

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
      createElement(BillingLockCard, { merchantId: "t1", lock, canForceUnlock, shopPaused }),
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
      "Renewal is off, so money alone does not open it: it opens when the shop pays 25,000 IQD on its lock screen, or when staff turn renewal on and the wallet pays it.",
    );
    expect(html).not.toContain("from the wallet opens it");
    expect(render(true, { ...LOCK, renewal_off: true }, true)).toContain("Paused, and renewal is off. Once the pause lifts, it opens when the shop pays");
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
