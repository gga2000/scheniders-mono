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

import { computeCustomerStats, isRepeatCustomer } from "./duplicate-comparison";

describe("computeCustomerStats", () => {
  it("counts realized spend from delivered + completed only", () => {
    const orders: Order[] = [
      order({ id: "a", status: "delivered", price: 10000 }),
      order({ id: "b", status: "completed", price: 5000 }),
      order({ id: "c", status: "cancelled", price: 99000 }),
      order({ id: "d", status: "new", price: 7000 }),
    ];
    const s = computeCustomerStats(orders);
    expect(s.totalOrders).toBe(4);
    expect(s.totalSpent).toBe(15000); // cancelled + new excluded
    expect(s.deliveredCount).toBe(1);
    expect(s.completedCount).toBe(1);
    expect(s.cancelledCount).toBe(1);
    expect(s.cancelRate).toBeCloseTo(0.25);
  });

  it("returns zero cancelRate for empty input", () => {
    const s = computeCustomerStats([]);
    expect(s.totalOrders).toBe(0);
    expect(s.cancelRate).toBe(0);
  });
});

describe("isRepeatCustomer", () => {
  it("requires 3+ orders and at least one fulfilled", () => {
    expect(isRepeatCustomer(computeCustomerStats([
      order({ id: "a", status: "delivered" }),
      order({ id: "b", status: "new" }),
      order({ id: "c", status: "new" }),
    ]))).toBe(true);
    expect(isRepeatCustomer(computeCustomerStats([
      order({ id: "a", status: "new" }),
      order({ id: "b", status: "new" }),
      order({ id: "c", status: "new" }),
    ]))).toBe(false);
    expect(isRepeatCustomer(computeCustomerStats([
      order({ id: "a", status: "delivered" }),
    ]))).toBe(false);
  });
});

import { sortByScoreDesc, reassignMergeTarget, rowAllMatch } from "./duplicate-comparison";

describe("sortByScoreDesc", () => {
  it("orders by score descending without mutating input", () => {
    const a = order({ id: "a" });
    const b = order({ id: "b" });
    const c = order({ id: "c" });
    const input = [a, b, c];
    const out = sortByScoreDesc(input, { a: 55, b: 85, c: 60 });
    expect(out.map((o) => o.id)).toEqual(["b", "c", "a"]);
    expect(input.map((o) => o.id)).toEqual(["a", "b", "c"]); // unmutated
  });
});

describe("reassignMergeTarget", () => {
  const scores = { a: 55, b: 85, c: 60 };
  it("keeps current target when still displayed", () => {
    expect(reassignMergeTarget(["a", "b", "c"], "a", scores)).toBe("a");
  });
  it("picks highest score when target hidden", () => {
    expect(reassignMergeTarget(["a", "c"], "b", scores)).toBe("c");
  });
  it("returns null when nothing displayed", () => {
    expect(reassignMergeTarget([], "b", scores)).toBeNull();
  });
  it("picks highest score when target is null", () => {
    expect(reassignMergeTarget(["a", "b"], null, scores)).toBe("b");
  });
});

describe("rowAllMatch", () => {
  it("true when every displayed order equals current accessor value", () => {
    const cur = order({ city: "Baghdad" });
    const displayed = [order({ id: "x", city: "Baghdad" }), order({ id: "y", city: "Baghdad" })];
    expect(rowAllMatch(cur, displayed, (o) => o.city)).toBe(true);
  });
  it("false when any differs", () => {
    const cur = order({ city: "Baghdad" });
    const displayed = [order({ id: "x", city: "Basra" })];
    expect(rowAllMatch(cur, displayed, (o) => o.city)).toBe(false);
  });
  it("false when nothing displayed", () => {
    expect(rowAllMatch(order({}), [], (o) => o.city)).toBe(false);
  });
});
