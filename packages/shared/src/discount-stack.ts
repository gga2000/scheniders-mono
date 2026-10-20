// =====================================================================
// Stacking discounts against one subtotal
// =====================================================================
// A coupon, a bundle saving and a points redemption are each capped at the
// subtotal on their own, which is not the same as their SUM being capped:
// 30,000 + 25,000 against a 40,000 basket records a negative order total and
// a courier collecting less than the delivery fee. They are applied in
// sequence instead, each against what the previous ones left, so the total
// discount can never exceed the subtotal. Used by the checkout and by the
// post-purchase upsell's total.
// =====================================================================

export interface StackedDiscounts {
  /** What each discount actually took, in the order given. */
  applied: number[];
  /** Their sum; always 0 ≤ total ≤ subtotal. */
  total: number;
}

export function stackDiscounts(subtotalIqd: number, amounts: readonly number[]): StackedDiscounts {
  let remaining = Number.isFinite(subtotalIqd) ? Math.max(0, Math.round(subtotalIqd)) : 0;
  const applied = amounts.map((amount) => {
    const want = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
    const take = Math.min(want, remaining);
    remaining -= take;
    return take;
  });
  return { applied, total: applied.reduce((s, a) => s + a, 0) };
}
