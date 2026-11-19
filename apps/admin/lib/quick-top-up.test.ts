import { describe, expect, it } from "vitest";
import { quickTopUpPlan } from "./quick-top-up";

const SHOP = { business_name: "Kut Perfumes", balance_iqd: 43_800 };

describe("Quick Top-Up says what it will do before the press", () => {
  it("names the shop, the amount and the wallet now, and the button names the amount", () => {
    expect(quickTopUpPlan(SHOP, 500_000, "Qi transfer, receipt 12")).toEqual({
      kind: "ready",
      amount: 500_000,
      sentence: "Adds 500,000 IQD to Kut Perfumes. Its wallet holds 43,800 IQD now.",
      button: "Add 500,000 IQD",
    });
  });

  it("waits for a shop, a whole amount above 0 and a reason", () => {
    expect(quickTopUpPlan(undefined, 500_000, "Qi transfer")).toEqual({ kind: "not_ready" });
    expect(quickTopUpPlan(SHOP, "", "Qi transfer")).toEqual({ kind: "not_ready" });
    expect(quickTopUpPlan(SHOP, 0, "Qi transfer")).toEqual({ kind: "not_ready" });
    expect(quickTopUpPlan(SHOP, 2_500.5, "Qi transfer")).toEqual({ kind: "not_ready" });
    expect(quickTopUpPlan(SHOP, 25_000, "ok")).toEqual({ kind: "not_ready" });
  });

  it("says the limit above 10,000,000 IQD instead of a refusal after the press", () => {
    expect(quickTopUpPlan(SHOP, 10_000_000, "Qi transfer").kind).toBe("ready");
    expect(quickTopUpPlan(SHOP, 10_000_001, "Qi transfer")).toEqual({ kind: "too_much", words: "At most 10,000,000 IQD at once." });
  });
});
