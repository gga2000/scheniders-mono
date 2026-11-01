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
import { parseProductAttributeDefs, resolveProductAttributes } from "@scheniders/shared";
import { CatalogGrid } from "./catalog-grid";
import type { Category, Product } from "../types";

afterEach(cleanup);

// jsdom has no HTMLDialogElement.showModal/close. The browser's versions add
// focus trapping and inertness on top; the open/closed state is what the
// tests below rely on, and that is all this stands in for.
beforeEach(() => {
  const proto = window.HTMLDialogElement.prototype;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

// The controls write themselves into the URL, and read it back on mount. That
// is the point of them — but it means one case's filter would otherwise arrive
// as the next case's starting state.
beforeEach(() => window.history.replaceState(null, "", "/"));

const product = (id: string, price: number): Product =>
  ({ id, name: id, price, stock_quantity: 5, reserved_quantity: 0 }) as Product;

const category = (id: string, name: string): Category =>
  ({ id, name, slug: `${id}-perfumes`, display_order: 0 }) as Category;

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

function mount(pageSize = 12, showSearch = false) {
  return render(
    <CatalogGrid
      showSearch={showSearch}
      // Cards arrive rendered, exactly as a server component hands them over.
      items={products.map((p) => ({
        product: p,
        card: <div data-card={p.id}>{p.name}</div>,
      }))}
      categories={categories}
      categoryProductIds={categoryProductIds}
      locale={"ar" as never}
      pageSize={pageSize}
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

/** Facets and the price split sit in the «فلتر» sheet; open it first. */
function openFilters(root: HTMLElement): void {
  press(root.querySelector<HTMLButtonElement>("[data-catalog-filter-open]"));
}

/** The sheet's primary action: shows the results and closes the sheet. */
function applyFilters(root: HTMLElement): void {
  press(root.querySelector<HTMLButtonElement>("[data-catalog-filter-apply]"));
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
    // The slug, not the uuid: a shared link should read as what it opens.
    expect(window.location.search).toContain("cat=night-perfumes");
    press(container.querySelector<HTMLButtonElement>("[data-clear-filters]"));
    expect(window.location.search).not.toContain("cat=");
  });

  it("restores the filter from the URL on mount", () => {
    // The case that matters on a phone: tap a product, press back. Without
    // this the shopper lands on an unfiltered catalogue and has to start over.
    window.history.replaceState(
      null,
      "",
      "/?cat=night-perfumes&sort=price_desc",
    );
    const { container } = mount();
    expect(cards(container)).toEqual(["p3", "p2", "p1"]);
    expect(chip("ليلي").getAttribute("aria-pressed")).toBe("true");
  });

  it("names the price axis so it does not read as two more categories", () => {
    const { container } = mount();
    const label = container.querySelector("[data-price-label]");
    expect(label?.textContent).toBe("السعر");
    // And it sits with the price chips, not with the category rail.
    expect(label?.parentElement?.textContent).toContain("أقل من");
  });

  it("still resolves a category that has no slug", () => {
    // Slug is optional on Category. Falling back to the id keeps the chip
    // working instead of silently filtering to nothing.
    const slugless = { id: "night", name: "ليلي", display_order: 0 } as Category;
    window.history.replaceState(null, "", "/?cat=night");
    const { container } = render(
      <CatalogGrid
        items={products.map((p) => ({
          product: p,
          card: <div data-card={p.id}>{p.name}</div>,
        }))}
        categories={[slugless]}
        categoryProductIds={categoryProductIds}
        locale={"ar" as never}
      />,
    );
    expect(cards(container)).toEqual(["p1", "p2", "p3"]);
  });

  it("counts every chip against the price filter that is already on", () => {
    const { container } = mount();
    // The split for this catalogue is the median 40,000.
    openFilters(container);
    const under = chip("أقل من");
    fireEvent.click(under);
    applyFilters(container);
    const night = chip("ليلي");
    const promised = Number(within(night).getByText(/^\d+$/).textContent);
    // p1 and p2 are under 40,000; p3 is not. A chip that ignored the active
    // price filter would still claim 3.
    expect(promised).toBe(2);
    fireEvent.click(night);
    expect(cards(container)).toHaveLength(2);
  });

  it("says how many of how many are on the page", () => {
    // The rail's count states how many MATCH. Nothing stated how many were
    // actually rendered, so a shopper who had scrolled past the rail saw a
    // dozen cards and no reason to believe there were more.
    const { container } = mount(2);
    const label = () => container.querySelector("[data-shown-of]")?.textContent;
    expect(label()).toContain("2");
    expect(label()).toContain("5");
    press(container.querySelector<HTMLButtonElement>("[data-load-more]"));
    expect(label()).toContain("4");
  });

  it("drops the progress line once everything is shown", () => {
    // "5 of 5" under a control that is no longer there is noise.
    const { container } = mount(12);
    expect(container.querySelector("[data-shown-of]")).toBeNull();
    expect(container.querySelector("[data-load-more]")).toBeNull();
  });
});

describe("CatalogGrid — search", () => {
  const box = (root: HTMLElement): HTMLInputElement => {
    const el = root.querySelector("[data-catalog-search]");
    if (!el) throw new Error("no search field");
    return el as HTMLInputElement;
  };
  const type = (root: HTMLElement, value: string) =>
    fireEvent.change(box(root), { target: { value } });

  it("is absent unless asked for", () => {
    const { container } = mount(12);
    expect(container.querySelector("[data-catalog-search]")).toBeNull();
  });

  it("narrows the grid to the matching products", () => {
    const { container } = render(
      <CatalogGrid
        showSearch
        items={[
          { product: { id: "a", name: "عود أزرق", price: 20000, stock_quantity: 5, reserved_quantity: 0 } as Product, card: <div data-card="a" /> },
          { product: { id: "b", name: "مسك أبيض", price: 30000, stock_quantity: 5, reserved_quantity: 0 } as Product, card: <div data-card="b" /> },
        ]}
        categories={[]}
        locale={"ar" as never}
      />,
    );
    expect(cards(container)).toEqual(["a", "b"]);
    // Typed without the hamza the merchant used — this is the case a plain
    // substring match fails.
    type(container, "ازرق");
    expect(cards(container)).toEqual(["a"]);
  });

  it("makes the count agree with the grid", () => {
    const { container } = mount(12, true);
    // "p" matches all five; "p3" matches one. Both counts are read off the
    // same line the shopper reads, and both must match what the grid yields.
    type(container, "p");
    expect(cards(container)).toHaveLength(5);
    expect(
      container.querySelector("[data-result-count]")?.textContent ?? "",
    ).toContain("5");
    type(container, "p3");
    expect(cards(container)).toEqual(["p3"]);
    // One result reads as the Arabic singular, with no digit in it at all.
    expect(container.querySelector("[data-result-count]")?.textContent).toBe(
      "عطر واحد",
    );
  });

  it("drops a chip whose category no longer has a match", () => {
    const { container } = mount(12, true);
    // "gift" holds only p4, so searching for p1 must remove that chip rather
    // than leave it offering an empty view.
    type(container, "p1");
    expect(container.textContent).not.toContain("هدية");
  });

  it("starts paging over when the query changes", () => {
    const { container } = mount(2, true);
    expect(cards(container)).toHaveLength(2);
    press(container.querySelector("[data-load-more]"));
    expect(cards(container)).toHaveLength(4);
    // A new query must show page one of its own results, not page two.
    type(container, "p");
    expect(cards(container)).toHaveLength(2);
  });

  it("writes the query into the URL and reads it back on mount", () => {
    const { container, unmount } = mount(12, true);
    type(container, "p3");
    expect(window.location.search).toContain("q=p3");
    unmount();
    cleanup();
    const second = mount(12, true);
    expect(box(second.container).value).toBe("p3");
    expect(cards(second.container)).toEqual(["p3"]);
  });

  it("clears the query, the URL and the filtered view together", () => {
    const { container } = mount(12, true);
    type(container, "p3");
    press(container.querySelector("[data-catalog-search-clear]"));
    expect(box(container).value).toBe("");
    expect(window.location.search).not.toContain("q=");
    expect(cards(container)).toHaveLength(products.length);
  });

  it("offers a split the searched set can be divided on, even when the shop cannot", () => {
    // 10,000 / 11,000 / 90,000. Across the whole shop the median rounds to
    // 10,000 and leaves nothing under it, so there is no split to offer. The
    // two products matching "qq" — 10,000 and 90,000 — divide cleanly. The
    // control has to describe the set on screen, not the shop.
    const priced = (id: string, name: string, price: number): Product =>
      ({ id, name, price, stock_quantity: 5, reserved_quantity: 0 }) as Product;
    const { container } = render(
      <CatalogGrid
        showSearch
        items={[
          { product: priced("a", "qq alpha", 10000), card: <div data-card="a" /> },
          { product: priced("b", "zz other", 11000), card: <div data-card="b" /> },
          { product: priced("c", "qq omega", 90000), card: <div data-card="c" /> },
        ]}
        categories={[]}
        locale={"ar" as never}
      />,
    );
    expect(container.querySelector("[data-price-label]")).toBeNull();
    fireEvent.change(
      container.querySelector("[data-catalog-search]") as HTMLInputElement,
      { target: { value: "qq" } },
    );
    expect(cards(container)).toEqual(["a", "c"]);
    expect(container.querySelector("[data-price-label]")).not.toBeNull();
  });

  it("withdraws the price split when the search leaves nothing to split", () => {
    const { container } = mount(12, true);
    // All five products: the split divides them, so both bands are offered.
    expect(container.querySelector("[data-price-label]")).not.toBeNull();
    // One product cannot be halved — offering "under" and "over" would mean
    // one of them yields zero.
    type(container, "p3");
    expect(cards(container)).toEqual(["p3"]);
    expect(container.querySelector("[data-price-label]")).toBeNull();
    expect(container.textContent).not.toContain("أقل من");
  });

  it("withdraws a band that the active category empties", () => {
    // "هدية" holds only p4 at 50,000, and the catalogue's split sits at
    // 40,000 — so "under 40,000" inside that category yields nothing. The
    // threshold is real; the band is not.
    const { container } = mount(12, true);
    press(chip("هدية"));
    expect(cards(container)).toEqual(["p4"]);
    expect(container.querySelector("[data-price-label]")).toBeNull();
  });

  it("says the word missed, not that the filter did", () => {
    const { container } = mount(12, true);
    type(container, "zzzz");
    expect(cards(container)).toEqual([]);
    expect(container.textContent).toContain("ما لكينا عطر بهذا الاسم");
    expect(container.textContent).not.toContain("ما لكينا عطور بهذا الفلتر");
  });
});

describe("CatalogGrid — attribute facets", () => {
  const defs = parseProductAttributeDefs([
    {
      id: "d1",
      key: "scent_family",
      kind: "enum",
      display_order: 0,
      is_filterable: true,
      name_i18n: { ar: "العائلة العطرية" },
      options: [
        { value: "oriental", label_i18n: { ar: "شرقي" } },
        { value: "woody", label_i18n: { ar: "خشبي" } },
      ],
    },
  ]);
  const withFamily = (p: Product, family: string): Product => ({
    ...p,
    attributes: resolveProductAttributes(
      defs,
      defs.map((d) => ({ product_id: p.id, attribute_def_id: d.id, value: family })),
    ),
  });
  const pool = products.map((p, i) =>
    i < 2 ? withFamily(p, "oriental") : i === 2 ? withFamily(p, "woody") : p,
  );

  function mountFacets(showFacets: boolean) {
    return render(
      <CatalogGrid
        showFacets={showFacets}
        items={pool.map((p) => ({
          product: p,
          card: <div data-card={p.id}>{p.name}</div>,
        }))}
        categories={categories}
        categoryProductIds={categoryProductIds}
        locale={"ar" as never}
      />,
    );
  }

  it("is absent unless asked for", () => {
    const { container } = mountFacets(false);
    expect(container.querySelector("[data-attribute-facet]")).toBeNull();
  });

  it("narrows the grid and every chip count to the picked option", () => {
    const { container } = mountFacets(true);
    expect(
      container.querySelector('[data-attribute-facet="scent_family"]'),
    ).not.toBeNull();
    openFilters(container);
    press(chip("شرقي"));
    applyFilters(container);
    expect(cards(container).sort()).toEqual(["p1", "p2"]);
    // Category chips count inside the facet selection, so "night" now
    // advertises the two oriental products it actually yields.
    expect(chip("ليلي").textContent).toContain("2");
    expect(window.location.search).toContain("attr=scent_family%3Aoriental");
  });

  it("clears the facet together with the other filters", () => {
    const { container } = mountFacets(true);
    openFilters(container);
    press(chip("خشبي"));
    applyFilters(container);
    expect(cards(container)).toEqual(["p3"]);
    press(container.querySelector<HTMLButtonElement>("[data-clear-filters]"));
    expect(cards(container)).toHaveLength(5);
    expect(window.location.search).not.toContain("attr=");
  });

  it("restores the facet from the URL on mount", () => {
    window.history.replaceState(null, "", "/?attr=scent_family%3Awoody");
    const { container } = mountFacets(true);
    expect(cards(container)).toEqual(["p3"]);
    openFilters(container);
    expect(chip("خشبي").getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the facet rails off the page until «فلتر» is pressed", () => {
    const { container } = mountFacets(true);
    const sheet = container.querySelector("[data-catalog-filter-sheet]");
    expect(sheet?.hasAttribute("open")).toBe(false);
    openFilters(container);
    expect(sheet?.hasAttribute("open")).toBe(true);
  });

  it("badges the filter button with what the sheet is narrowing by", () => {
    const { container } = mountFacets(true);
    expect(container.querySelector("[data-catalog-filter-count]")).toBeNull();
    openFilters(container);
    press(chip("شرقي"));
    press(chip("أقل من"));
    expect(container.querySelector("[data-catalog-filter-count]")?.textContent).toBe("2");
  });

  it("names the live yield on the sheet's apply button", () => {
    const { container } = mountFacets(true);
    openFilters(container);
    press(chip("شرقي"));
    const apply = container.querySelector("[data-catalog-filter-apply]");
    // Two oriental perfumes: Arabic says it with the dual, not a numeral.
    expect(cards(container)).toHaveLength(2);
    expect(apply?.textContent).toBe("اعرض عطران");
  });
});
