// =====================================================================
// The PDP buy box and the product cards must agree
// =====================================================================
// A shopper arrives at the PDP from a card. The same product's price, its
// struck original and its discount all appear on both, so the two must
// state them identically — same colour, same notation, same arithmetic.
//
// The buy box used to compute the percentage inline, which is a second
// implementation of a sum `discountPercent` already owns, and it lacked
// that helper's guard against a zero price.
// =====================================================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { discountPercent, formatPercent } from "./helpers/format";

const buyBox = readFileSync(
  new URL("./pdp_direct_order.client.tsx", import.meta.url),
  "utf8",
);

describe("pdp_direct_order — the price block", () => {
  it("derives the discount from the shared helper, not its own sum", () => {
    expect(buyBox).toContain("discountPercent(price, compareAt)");
    // The inline form this replaced.
    expect(buyBox).not.toMatch(/\(\(compareAt - price\) \/ compareAt\) \* 100/);
  });

  it("prints the percentage through formatPercent, not a Latin literal", () => {
    // "-23%" on the PDP against "٢٣٪" on every card is the same fact in two
    // notations.
    expect(buyBox).toContain("formatPercent(discountPct");
    expect(buyBox).not.toContain("`-${discountPct}%`");
  });

  it("colours the paid price like the cards do", () => {
    // Green means "this is what you pay". It was the buy-yellow here and
    // green on the card, so the same number met the shopper twice in two
    // colours.
    expect(buyBox).toContain("--bk-success");
    expect(buyBox).toContain("--bk-danger");
  });

  it("agrees with the cards on what a discount even is", () => {
    // Both read the same function, so these can never diverge: a zero price
    // is no discount, not 100% off.
    expect(discountPercent(37000, 48000)).toBe(23);
    expect(discountPercent(0, 48000)).toBeNull();
    expect(formatPercent(23, "ar" as never)).toContain("٪");
  });
});
