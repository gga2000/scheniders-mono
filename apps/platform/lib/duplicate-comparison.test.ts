import { describe, it, expect } from "vitest";
import type { Order } from "@/lib/supabase";
import {
  likelihoodTier,
  deriveSignals,
  getRelativeTime,
} from "./duplicate-comparison";

function order(partial: Partial<Order>): Order {
  return {
    id: "o1",
    order_id: "1000",
    customer_name: "Acme",
    phone: "07700000000",
    city: "Baghdad",
    price: 10000,
    status: "new",
    items: [],
    is_return: false,
    created_at: "2026-06-23T12:00:00Z",
    ...partial,
  } as Order;
}

describe("likelihoodTier", () => {
  it("maps score to tier by threshold", () => {
    expect(likelihoodTier(85)).toBe("high");
    expect(likelihoodTier(80)).toBe("high");
    expect(likelihoodTier(60)).toBe("medium");
    expect(likelihoodTier(59)).toBe("low");
    expect(likelihoodTier(0)).toBe("low");
  });
});

describe("deriveSignals", () => {
  it("returns empty when no nearest order", () => {
    expect(deriveSignals(order({}), undefined)).toEqual([]);
  });

  it("flags matching phone as danger and adds other matches", () => {
    const cur = order({ phone: "0770 111 2222", customer_name: "Ali", city: "Basra", items: [{ name: "X", quantity: 1, price: 1 }] as Order["items"] });
    const near = order({ phone: "07701112222", customer_name: "Ali", city: "Basra", items: [{ name: "X", quantity: 2, price: 1 }] as Order["items"] });
    const keys = deriveSignals(cur, near).map((s) => s.key);
    expect(keys).toContain("samePhone");
    expect(keys).toContain("sameName");
    expect(keys).toContain("sameCity");
    expect(keys).toContain("sameProduct");
    expect(keys).toContain("timeDelta");
    const phone = deriveSignals(cur, near).find((s) => s.key === "samePhone");
    expect(phone?.danger).toBe(true);
  });
});

describe("getRelativeTime", () => {
  it("returns an Arabic relative string for a past date", () => {
    const past = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(getRelativeTime(past)).toMatch(/ساعة/);
  });
});
