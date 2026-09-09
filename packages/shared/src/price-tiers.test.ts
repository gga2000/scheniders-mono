import { describe, expect, it } from "vitest";
import { buildPriceLadder, resolveTierPrice, type PriceTier } from "./price-tiers";

const BASE = 35000;
const TIERS: PriceTier[] = [
  { min_quantity: 2, max_quantity: 2, price: 32500 },
  { min_quantity: 3, max_quantity: null, price: 30000 },
];

describe("resolveTierPrice", () => {
  it("returns the base price below the first tier", () => {
    expect(resolveTierPrice(TIERS, 1, BASE)).toBe(BASE);
  });

  it("applies the matching tier", () => {
    expect(resolveTierPrice(TIERS, 2, BASE)).toBe(32500);
    expect(resolveTierPrice(TIERS, 3, BASE)).toBe(30000);
  });

  it("keeps applying an open-ended top tier", () => {
    expect(resolveTierPrice(TIERS, 50, BASE)).toBe(30000);
  });

  it("falls back to base with no tiers", () => {
    expect(resolveTierPrice([], 5, BASE)).toBe(BASE);
    expect(resolveTierPrice(null, 5, BASE)).toBe(BASE);
    expect(resolveTierPrice(undefined, 5, BASE)).toBe(BASE);
  });

  it("is deterministic when tiers overlap — highest min_quantity wins", () => {
    // The editor tries to prevent overlaps, but stored data may contain
    // them, and client and server MUST land on the same number.
    const overlapping: PriceTier[] = [
      { min_quantity: 2, max_quantity: 10, price: 33000 },
      { min_quantity: 5, max_quantity: 10, price: 31000 },
    ];
    expect(resolveTierPrice(overlapping, 6, BASE)).toBe(31000);
    expect(resolveTierPrice([...overlapping].reverse(), 6, BASE)).toBe(31000);
  });

  it("ignores a malformed tier rather than pricing from it", () => {
    const bad: PriceTier[] = [
      { min_quantity: 2, max_quantity: null, price: Number.NaN },
      { min_quantity: 2, max_quantity: null, price: -5 },
    ];
    expect(resolveTierPrice(bad, 3, BASE)).toBe(BASE);
  });

  it("refuses a nonsensical quantity", () => {
    expect(resolveTierPrice(TIERS, 0, BASE)).toBe(BASE);
    expect(resolveTierPrice(TIERS, -2, BASE)).toBe(BASE);
    expect(resolveTierPrice(TIERS, Number.NaN, BASE)).toBe(BASE);
  });
});

describe("buildPriceLadder", () => {
  it("opens with the single unit, then one rung per tier", () => {
    const ladder = buildPriceLadder(TIERS, BASE, 10);
    expect(ladder.map((r) => r.quantity)).toEqual([1, 2, 3]);
    expect(ladder[1]).toMatchObject({ unit_price: 32500, total: 65000, saves: 5000 });
    expect(ladder[2]).toMatchObject({ unit_price: 30000, total: 90000, saves: 15000 });
  });

  it("drops a rung that saves nothing — a tile that lies is worse than no tile", () => {
    const flat: PriceTier[] = [{ min_quantity: 2, max_quantity: null, price: BASE }];
    expect(buildPriceLadder(flat, BASE, 10)).toEqual([]);
  });

  it("returns no ladder at all when there are no tiers", () => {
    // A lone "1" rung is not a ladder; the PDP should show its normal stepper.
    expect(buildPriceLadder([], BASE, 10)).toEqual([]);
    expect(buildPriceLadder(null, BASE, 10)).toEqual([]);
  });

  it("never offers more than the shopper is allowed to buy", () => {
    expect(buildPriceLadder(TIERS, BASE, 2).map((r) => r.quantity)).toEqual([1, 2]);
  });

  it("agrees with resolveTierPrice at every rung", () => {
    // The ladder is what the shopper is shown; resolveTierPrice is what the
    // server charges. They must never disagree.
    for (const rung of buildPriceLadder(TIERS, BASE, 10)) {
      expect(resolveTierPrice(TIERS, rung.quantity, BASE)).toBe(rung.unit_price);
    }
  });
});
