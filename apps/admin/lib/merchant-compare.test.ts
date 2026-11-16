import { describe, expect, it } from "vitest";
import { formatBaghdadDay, parseComparisonShops } from "./merchant-compare";

const row = (extra: Record<string, unknown> = {}) => ({
  id: "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d",
  business_name: "Shop one",
  plan: "starter",
  status: "active",
  city: "Baghdad",
  created_at: "2026-06-08T07:00:00+00:00",
  wallet: { balance_iqd: 43_800, threshold_iqd: 0 },
  orders_30d: 328,
  fees_30d: 9_085,
  team_members: 7,
  order_sparkline: new Array(30).fill(1),
  staff_health_score: 80,
  staff_health_parts: { status: 15, wallet: 5, orders: 10 },
  // What the list also sends and a compare view must not read.
  usage: { orders_count: 42, orders_charged: 40, team_members_count: 0 },
  ...extra,
});

describe("parseComparisonShops", () => {
  it("takes orders and fees of the last 30 days and the active team, not the usage month", () => {
    const [shop] = parseComparisonShops({ merchants: [row()] });

    expect(shop).toMatchObject({
      business_name: "Shop one",
      wallet_balance: 43_800,
      orders_30d: 328,
      fees_30d: 9_085,
      team_members: 7,
      health_score: 80,
      health_parts: { status: 15, wallet: 5, orders: 10 },
    });
  });

  it("reads a shop with no wallet row as an empty wallet", () => {
    expect(parseComparisonShops({ merchants: [row({ wallet: null })] })[0]?.wallet_balance).toBe(0);
  });

  it("refuses an answer that leaves a number out, so a missing number is never drawn as 0", () => {
    for (const missing of ["orders_30d", "fees_30d", "team_members", "staff_health_score"]) {
      const shop = Object.fromEntries(Object.entries(row()).filter(([key]) => key !== missing));
      expect(() => parseComparisonShops({ merchants: [shop] }), missing).toThrow();
    }
    expect(() => parseComparisonShops({ error: "Failed" })).toThrow();
  });
});

describe("formatBaghdadDay", () => {
  it("names the day it was in Baghdad", () => {
    // 22:30 UTC on 7 June is 01:30 on 8 June in Baghdad.
    expect(formatBaghdadDay("2026-06-07T22:30:00+00:00")).toBe("8 Jun 2026");
  });
});
