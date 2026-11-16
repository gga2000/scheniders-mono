import { describe, expect, it } from "vitest";
import { computedShopFilters } from "./merchant-filters";

describe("computedShopFilters", () => {
  it("adds nothing when nothing computed is asked for", () => {
    expect(computedShopFilters({})).toEqual([]);
    expect(computedShopFilters({ status: "trial", balance: null, health: null })).toEqual([]);
  });

  it('reads "attention" as the needs-attention filter, not as a status', () => {
    expect(computedShopFilters({ status: "attention" })).toEqual([["staff_needs_attention", "eq", true]]);
  });

  it("cuts the wallet into three bands that leave no balance out and count none twice", () => {
    expect(computedShopFilters({ balance: "critical" })).toEqual([["staff_wallet_balance", "lt", 10000]]);
    expect(computedShopFilters({ balance: "low" })).toEqual([
      ["staff_wallet_balance", "gte", 10000],
      ["staff_wallet_balance", "lte", 50000],
    ]);
    expect(computedShopFilters({ balance: "healthy" })).toEqual([["staff_wallet_balance", "gt", 50000]]);
  });

  it("cuts the health score into three bands the same way", () => {
    expect(computedShopFilters({ health: "at_risk" })).toEqual([["staff_health_score", "lt", 40]]);
    expect(computedShopFilters({ health: "warning" })).toEqual([
      ["staff_health_score", "gte", 40],
      ["staff_health_score", "lt", 70],
    ]);
    expect(computedShopFilters({ health: "healthy" })).toEqual([["staff_health_score", "gte", 70]]);
  });

  it("ignores a band name the console does not use", () => {
    expect(computedShopFilters({ balance: "constructor", health: "toString" })).toEqual([]);
  });
});
