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
};

const render = (canForceUnlock: boolean, lock: BillingLockSnapshot = LOCK) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(BillingLockCard, { merchantId: "t1", lock, canForceUnlock }),
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

  it("offers the free unlock to super admins only", () => {
    expect(render(true)).toContain("Unlock for 30 days");
    expect(render(false)).not.toContain("Unlock for");
    expect(render(false)).toContain("Give more store orders");
  });

  it("keeps every tool off until a reason is written", () => {
    const html = render(true);
    // The order presets (+10, +25, +50), the custom grant and the unlock.
    const tools = (html.match(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g) ?? []).filter(
      (b) => /<\/svg>(10|25|50)<\/button>$/.test(b) || b.includes("Give these store orders") || b.includes("Unlock for"),
    );
    expect(tools).toHaveLength(5);
    for (const button of tools) expect(button).toMatch(/disabled=""/);
  });
});
