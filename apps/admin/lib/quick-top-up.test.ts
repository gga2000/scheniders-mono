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

  it("waits quietly for a shop, an amount and a reason", () => {
    expect(quickTopUpPlan(undefined, 500_000, "Qi transfer")).toEqual({ kind: "not_ready" });
    expect(quickTopUpPlan(SHOP, "", "Qi transfer")).toEqual({ kind: "not_ready" });
    expect(quickTopUpPlan(SHOP, 25_000, "")).toEqual({ kind: "not_ready" });
    expect(quickTopUpPlan(SHOP, 25_000, "   ")).toEqual({ kind: "not_ready" });
  });

  // r4-13: a fraction, a minus amount or a 2-letter reason left a grey "Top Up" with no word why.
  it("says why when what is typed cannot go through", () => {
    const amount = { kind: "blocked", words: "The amount is whole IQD, more than 0." };
    expect(quickTopUpPlan(SHOP, 0, "Qi transfer")).toEqual(amount);
    expect(quickTopUpPlan(SHOP, -5_000, "Qi transfer")).toEqual(amount);
    expect(quickTopUpPlan(SHOP, 2_500.5, "Qi transfer")).toEqual(amount);
    expect(quickTopUpPlan(SHOP, 25_000, "ok")).toEqual({ kind: "blocked", words: "Write a reason with at least 3 letters." });
  });

  // Round 18 (UX new 5): the rule counted any character, so "..." went through as a reason.
  it("counts letters, in any script, not dots or digits", () => {
    const short = { kind: "blocked", words: "Write a reason with at least 3 letters." };
    expect(quickTopUpPlan(SHOP, 25_000, "...")).toEqual(short);
    expect(quickTopUpPlan(SHOP, 25_000, "a.b")).toEqual(short);
    expect(quickTopUpPlan(SHOP, 25_000, "123")).toEqual(short);
    expect(quickTopUpPlan(SHOP, 25_000, "نقد").kind).toBe("ready");
    expect(quickTopUpPlan(SHOP, 25_000, "Qi 12")).toEqual(short);
    expect(quickTopUpPlan(SHOP, 25_000, "Zain 12").kind).toBe("ready");
  });

  it("says the limit above 10,000,000 IQD instead of a refusal after the press", () => {
    expect(quickTopUpPlan(SHOP, 10_000_000, "Qi transfer").kind).toBe("ready");
    expect(quickTopUpPlan(SHOP, 10_000_001, "Qi transfer")).toEqual({ kind: "blocked", words: "At most 10,000,000 IQD at once." });
  });
});
