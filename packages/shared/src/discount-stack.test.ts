import { describe, expect, it } from "vitest";
import { stackDiscounts } from "./discount-stack";

describe("stackDiscounts", () => {
  it("passes discounts that fit through unchanged", () => {
    expect(stackDiscounts(40000, [5000, 3000, 2000])).toEqual({ applied: [5000, 3000, 2000], total: 10000 });
  });

  it("caps the SUM at the subtotal, applying in order against what is left", () => {
    expect(stackDiscounts(40000, [30000, 25000, 9000])).toEqual({ applied: [30000, 10000, 0], total: 40000 });
  });

  it("ignores nonsense amounts rather than adding them", () => {
    expect(stackDiscounts(10000, [Number.NaN, -500, 2000])).toEqual({ applied: [0, 0, 2000], total: 2000 });
    expect(stackDiscounts(-1, [500])).toEqual({ applied: [0], total: 0 });
  });
});
