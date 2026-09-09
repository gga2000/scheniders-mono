import { describe, expect, it } from "vitest";
import { stampCodRisk } from "./cod-risk";

const NOW = new Date("2026-09-10T12:00:00Z");

describe("stampCodRisk", () => {
  it("turns the SQL verdict into the three order fields", () => {
    const stamp = stampCodRisk(
      {
        level: "high", value_tier: "newcomer", is_blacklisted: false, total_orders: 4, completed_count: 1,
        severe_count: 2, recent_severe_count: 2, moderate_count: 0, recent_moderate_count: 0,
        open_orders_24h: 1, orders_last_hour: 0, duplicate_of_order_id: "11111111-1111-4111-8111-111111111111",
        address_length: 25, reasons: ["high_risk_customer", "duplicate_order"],
      },
      NOW,
    );
    expect(stamp).toEqual({
      needs_attention: true,
      attention_reasons: ["high_risk_customer", "duplicate_order"],
      risk_metadata: {
        level: "high", reasons: ["high_risk_customer", "duplicate_order"], is_blacklisted: false, value_tier: "newcomer",
        total_orders: 4, completed_count: 1, severe_count: 2, recent_severe_count: 2, moderate_count: 0, recent_moderate_count: 0,
        open_orders_24h: 1, orders_last_hour: 0, duplicate_of_order_id: "11111111-1111-4111-8111-111111111111",
        source: "storefront", evaluated_at: NOW.toISOString(),
      },
    });
  });

  it("a clean buyer needs no attention; garbage is no verdict", () => {
    const clean = stampCodRisk({ level: "clean", value_tier: "vip", reasons: [], total_orders: 5 }, NOW);
    expect(clean?.needs_attention).toBe(false);
    expect(clean?.attention_reasons).toEqual([]);
    expect(stampCodRisk(null)).toBeNull();
    expect(stampCodRisk("nope")).toBeNull();
    // Unknown reason keys and levels are dropped rather than trusted.
    const odd = stampCodRisk({ level: "weird", reasons: ["made_up", "address_incomplete"] }, NOW);
    expect(odd?.risk_metadata.level).toBe("clean");
    expect(odd?.risk_metadata.value_tier).toBe("newcomer");
    expect(odd?.attention_reasons).toEqual(["address_incomplete"]);
  });
});
