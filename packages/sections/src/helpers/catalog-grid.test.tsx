// @vitest-environment jsdom
// =====================================================================
// CatalogGrid — the interactive guarantees
// =====================================================================
// The pure filtering rules live in catalog-filter.test.ts. What is tested
// here is what only a real DOM can show: that a chip yields the number it
// advertises, that load-more reveals one page and repeats nothing, and
// that the controls write themselves into the URL so the back button
// returns a shopper to the view they left.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CatalogGrid } from "./catalog-grid";
import type { Category, Product } from "../types";

afterEach(cleanup);

// The controls write themselves into the URL, and read it back on mount. That
// is the point of them — but it means one case's filter would otherwise arrive
// as the next case's starting state.
beforeEach(() => window.history.replaceState(null, "", "/"));

const product = (id: string, price: number): Product =>
  ({ id, name: id, price, stock_quantity: 5, reserved_quantity: 0 }) as Product;

const category = (id: string, name: string): Category =>
  ({ id, name, slug: id, display_order: 0 }) as Category;

// Five products, two categories. "night" has three members plus one row for a
// product that is not in the catalogue.
const products = [
  product("p1", 20000),
  product("p2", 30000),
  product("p3", 40000),
  product("p4", 50000),
  product("p5", 60000),
];
const categories = [category("night", "ليلي"), category("gift", "هدية"), category("none", "فاضي")];
const categoryProductIds = {
  night: ["p1", "p2", "p3", "missing"],
  gift: ["p4"],
};

function mount(pageSize = 12) {
  return render(
    <CatalogGrid
      products={products}
      categories={categories}
      categoryProductIds={categoryProductIds}
      locale={"ar" as never}
      pageSize={pageSize}
      renderCard={(p) => (
        <div key={p.id} data-card={p.id}>
          {p.name}
        </div>
      )}
    />,
  );
}

const cards = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-card]")].map((el) => el.getAttribute("data-card"));

/** fireEvent, not el.click(): only the former flushes the state update. */
function press(el: HTMLElement | null): void {
  if (!el) throw new Error("expected a control to press");
  fireEvent.click(el);
}

function chip(name: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(name) });
}

describe("CatalogGrid", () => {
  it("yields exactly the number of cards its chip advertises", () => {
    const { container } = mount();
    const night = chip("ليلي");
    // The chip's own label carries the count, so the assertion reads the
    // promise off the control rather than restating it.
    const promised = Number(within(night).getByText(/^\d+$/).textContent);
    expect(promised).toBe(3); // "missing" is a member row with no product
    fireEvent.click(night);
    expect(cards(container)).toHaveLength(promised);
  });

  it("does not offer a chip that opens onto nothing", () => {
    mount();
    expect(screen.queryByRole("button", { name: /فاضي/ })).toBeNull();
  });

  it("reveals exactly one page per press and repeats no product", () => {
    const { container } = mount(2);
    expect(cards(container)).toEqual(["p1", "p2"]);

    const more = () => container.querySelector<HTMLButtonElement>("[data-load-more]");
    press(more());
    expect(cards(container)).toEqual(["p1", "p2", "p3", "p4"]);
    press(more());
    const all = cards(container);
    expect(all).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    // A reveal that re-mounts an already-shown card would duplicate it.
    expect(new Set(all).size).toBe(all.length);
    // Nothing left to reveal, so the control retires.
    expect(more()).toBeNull();
  });

  it("resets to the first page when the filter changes", () => {
    const { container } = mount(2);
    press(container.querySelector<HTMLButtonElement>("[data-load-more]"));
    expect(cards(container)).toHaveLength(4);
    fireEvent.click(chip("ليلي"));
    // Carrying the old offset forward would show a shopper page two of a
    // list they have not seen page one of.
    expect(cards(container)).toEqual(["p1", "p2"]);
  });

  it("writes the filter into the URL and clears it again", () => {
    const { container } = mount();
    fireEvent.click(chip("ليلي"));
    expect(window.location.search).toContain("cat=night");
    press(container.querySelector<HTMLButtonElement>("[data-clear-filters]"));
    expect(window.location.search).not.toContain("cat=");
  });

  it("restores the filter from the URL on mount", () => {
    // The case that matters on a phone: tap a product, press back. Without
    // this the shopper lands on an unfiltered catalogue and has to start over.
    window.history.replaceState(null, "", "/?cat=night&sort=price_desc");
    const { container } = mount();
    expect(cards(container)).toEqual(["p3", "p2", "p1"]);
    expect(chip("ليلي").getAttribute("aria-pressed")).toBe("true");
  });

  it("counts every chip against the price filter that is already on", () => {
    const { container } = mount();
    // The split for this catalogue is the median 40,000.
    const under = chip("أقل من");
    fireEvent.click(under);
    const night = chip("ليلي");
    const promised = Number(within(night).getByText(/^\d+$/).textContent);
    // p1 and p2 are under 40,000; p3 is not. A chip that ignored the active
    // price filter would still claim 3.
    expect(promised).toBe(2);
    fireEvent.click(night);
    expect(cards(container)).toHaveLength(2);
  });
});
