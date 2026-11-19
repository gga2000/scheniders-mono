// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Staff console audit N7 and r3-9 (#1500): Health said "Low balance" and
 * "7/10" where Merchants says "Wallet under 5,000 IQD" and scores health out
 * of 100. Seen live after #1500: "Short by -5,000 IQD" said the shortfall
 * twice. Health now speaks the Merchants words, and the shortfall once.
 */

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));
vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true }));

const { default: HealthPage } = await import("./page");

const HEALTH = {
  platformHealth: { totalTenants: 2, activeTenants: 1, trialTenants: 1, suspendedTenants: 0, ordersLast24h: 1 },
  riskIndicators: [
    { tenant_id: "t-1", business_name: "Kut Perfumes", risk_score: 8, reasons: ["Wallet under 5,000 IQD", "No orders in 30 days"], balance_iqd: 0, plan: "starter" },
  ],
  lowBalanceWallets: [{ tenant_id: "t-1", business_name: "Kut Perfumes", balance_iqd: 0, threshold_iqd: 5000 }],
  tenantGrowth: { thisMonth: 1, lastMonth: 0 },
};

afterEach(() => {
  cleanup();
  send.mockReset();
});

describe("the Health page's words", () => {
  it("names the wallet problem as Merchants does, scores risk out of 10 in words, and says the shortfall once", async () => {
    send.mockResolvedValue(new Response(JSON.stringify(HEALTH), { status: 200 }));
    render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(HealthPage)));
    expect(await screen.findByText("Risk 8 of 10")).toBeTruthy();
    expect(screen.getByText("Wallets under their alert amount")).toBeTruthy();
    expect(screen.getByText("1 shop needs a look: 1 at risk, 1 wallet under its alert amount")).toBeTruthy();
    const main = document.body.textContent ?? "";
    expect(main).not.toContain("/10");
    expect(main).not.toContain("Low balance");
    expect(main).not.toContain("-5,000");
    expect(screen.getAllByText("5,000 IQD").length).toBe(2);
  });

  // r3-9: a shop listed at the lowest score, 3, had a green bar, as if safe.
  it("paints no listed shop green", async () => {
    const lowest = { ...HEALTH.riskIndicators[0], risk_score: 3, reasons: ["Wallet under 5,000 IQD"] };
    send.mockResolvedValue(new Response(JSON.stringify({ ...HEALTH, riskIndicators: [lowest] }), { status: 200 }));
    render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(HealthPage)));
    expect(await screen.findByText("Risk 3 of 10")).toBeTruthy();
    const bar = document.querySelector<HTMLElement>('[style*="width: 30%"]');
    expect(bar?.className).toContain("bg-amber-500");
    expect(document.querySelector('[class*="bg-green-500"]')).toBeNull();
  });
});
