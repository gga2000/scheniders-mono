// @vitest-environment jsdom
// =====================================================================
// product_reviews — the folded form, in a DOM
// =====================================================================
// Quiet layout: the entry button opens the form and puts focus on the
// first star; arriving on #reviews (the order tracker's "rate your
// order" link) opens it by itself. Classic layout: #reviews still
// focuses the always-visible form, so the refactor of that effect is
// pinned.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import product_reviews from "./product_reviews";
import type { Product } from "./types";
import { productCtx, saleProduct } from "./_pdp-fixtures";

const Reviews = product_reviews.render;
const LIVE = {
  heading_i18n: { ar: "آراء العملاء", en: "Customer reviews" },
  show_form: true,
};
const product: Product = { ...saleProduct, reviews: [] };

function mount(input: unknown) {
  return render(
    <StoreBaseProvider base="/s/fixture-store">
      <Reviews props={product_reviews.schema.parse(input)} ctx={productCtx(product)} />
    </StoreBaseProvider>,
  );
}

beforeEach(() => {
  // jsdom has no layout engine, so scrollIntoView is missing.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("quiet layout", () => {
  it("the entry button opens the form and focuses the first star", () => {
    const { container, getByText } = mount({ ...LIVE, layout: "quiet" });
    expect(container.querySelector("form")).toBeNull();
    fireEvent.click(getByText("اكتب تقييمك"));
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(document.activeElement).toBe(
      form?.querySelector('[role="radiogroup"] button'),
    );
    expect(container.querySelector("[data-review-entry]")).toBeNull();
  });

  it("#reviews opens the form on arrival", () => {
    window.history.replaceState(null, "", "/#reviews");
    const { container } = mount({ ...LIVE, layout: "quiet" });
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(document.activeElement).toBe(
      form?.querySelector('[role="radiogroup"] button'),
    );
  });
});

describe("classic layout", () => {
  it("#reviews still focuses the first star of the visible form", () => {
    window.history.replaceState(null, "", "/#reviews");
    const { container } = mount(LIVE);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(document.activeElement).toBe(
      form?.querySelector('[role="radiogroup"] button'),
    );
  });

  it("a normal visit focuses nothing", () => {
    mount(LIVE);
    expect(document.activeElement).toBe(document.body);
  });
});
