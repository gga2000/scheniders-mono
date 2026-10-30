// Test helpers for the cart, checkout and thank-you renders (slice 1h):
// mount a section in the browser under the store base, read its markup
// with React's render-order ids normalised, seed the cart, and check the
// redesign's rules over a soft render.

import type { ReactNode } from "react";
import { expect } from "vitest";
import { render } from "@testing-library/react";
import type { CartItem } from "@scheniders/shared";
import { useCart } from "./helpers/cart-store";
import { StoreBaseProvider } from "./helpers/store-context";

/** React's client `useId` values (_r_3_ in React 19.2; «r3» / :r3: before)
 *  depend on how many trees rendered first. */
export function html(container: HTMLElement): string {
  return container.innerHTML.replace(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/g, "«id»");
}

export function mountInStore(node: ReactNode) {
  return render(<StoreBaseProvider base="/s/fixture-store">{node}</StoreBaseProvider>);
}

export function withCart(items: CartItem[]): void {
  useCart.setState({ items, governorate: null, couponCode: null });
}

/** The colour lock (D4) and the LTR rule over one soft render: yellow fills
 *  only the order action (`yellowFills` of them), no yellow text, green only
 *  on the WhatsApp glyph and its tile's tint, no colour literal, no `dir`,
 *  no ink outline, no ellipsis. */
export function expectSoftRules(markup: string, yellowFills: number): void {
  expect(markup.split("bg-bk-primary ").length - 1).toBe(yellowFills);
  expect(markup).not.toContain("text-bk-primary");
  expect(markup).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
  expect(markup).not.toContain(' dir="');
  expect(markup).not.toContain("--bk-border-thickness");
  expect(markup).not.toContain("truncate");
  expect(markup.replace(/h-6 w-6 text-bk-success|bg-bk-success\/1[05]|border-bk-success\/25/g, "")).not.toContain(
    "bk-success",
  );
}
