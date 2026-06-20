import { describe, it, expect } from "vitest";
import {
  cartItemsSubtotal,
  cartItemCount,
  resolveCartRecovery,
  CART_RECOVERY_DEFAULT_DELAY_MIN,
} from "./abandoned-cart";

describe("cartItemsSubtotal", () => {
  it("sums price × quantity", () => {
    expect(
      cartItemsSubtotal([
        { price: 5000, quantity: 2 },
        { price: 3000, quantity: 1 },
      ]),
    ).toBe(13000);
  });

  it("floors negatives to 0 and is empty-safe", () => {
    expect(cartItemsSubtotal([{ price: -5, quantity: 3 }])).toBe(0);
    expect(cartItemsSubtotal([{ price: 1000, quantity: -2 }])).toBe(0);
    expect(cartItemsSubtotal([])).toBe(0);
  });
});

describe("cartItemCount", () => {
  it("sums quantities, flooring negatives", () => {
    expect(
      cartItemCount([{ quantity: 2 }, { quantity: 3 }, { quantity: -1 }]),
    ).toBe(5);
  });
});

describe("resolveCartRecovery", () => {
  it("is off by default with the default delay", () => {
    expect(resolveCartRecovery(undefined)).toEqual({
      enabled: false,
      delayMinutes: CART_RECOVERY_DEFAULT_DELAY_MIN,
    });
    expect(resolveCartRecovery(null)).toEqual({
      enabled: false,
      delayMinutes: CART_RECOVERY_DEFAULT_DELAY_MIN,
    });
  });

  it("honors enabled + clamps the delay to [5, 1440]", () => {
    expect(resolveCartRecovery({ enabled: true, delay_minutes: 60 })).toEqual({
      enabled: true,
      delayMinutes: 60,
    });
    expect(resolveCartRecovery({ enabled: true, delay_minutes: 1 }).delayMinutes).toBe(5);
    expect(resolveCartRecovery({ enabled: true, delay_minutes: 9999 }).delayMinutes).toBe(1440);
  });
});
