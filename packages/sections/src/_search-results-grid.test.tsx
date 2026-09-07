// search_results_grid (Phase 3F / P0-7, P2-27) — the query comes from
// `runtime.search_query`, so the SSR markup is already filtered: no full
// catalogue flash, no client-side re-filter.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";

import search_results_grid, {
  filterProductsByQuery,
} from "./search_results_grid";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";

const runtime = {
  page_id: "search" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-07T00:00:00Z"),
};

const products: Product[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "عطر الورد",
    sku: "ROSE-1",
    price: 25000,
    stock_quantity: 10,
    reserved_quantity: 0,
    is_archived: false,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "كريم اليدين",
    sku: "HAND-2",
    description: "كريم مرطب برائحة العطر",
    price: 12000,
    stock_quantity: 3,
    reserved_quantity: 0,
    is_archived: false,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Oud Intense",
    sku: "OUD-3",
    price: 90000,
    stock_quantity: 1,
    reserved_quantity: 0,
    is_archived: false,
  },
];

function render(
  query: string | undefined,
  ctx: Partial<SectionRenderContext> = {},
): string {
  const Render = search_results_grid.render;
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "/s/acme", children: null },
      React.createElement(Render, {
        props: {
          ...search_results_grid.defaultProps,
          card_style: "price_pill",
        },
        ctx: {
          tenant: {
            id: "t",
            business_name: "x",
            store_config: { contact: {} },
          } as never,
          runtime: {
            ...runtime,
            ...(query === undefined ? {} : { search_query: query }),
          },
          products,
          categories: [],
          ...ctx,
        },
      }),
    ),
  );
}

describe("filterProductsByQuery", () => {
  it("matches name, sku and description case-insensitively, AND-ing tokens", () => {
    expect(filterProductsByQuery(products, "عطر").map((p) => p.sku)).toEqual([
      "ROSE-1",
      "HAND-2",
    ]);
    expect(
      filterProductsByQuery(products, "oud intense").map((p) => p.sku),
    ).toEqual(["OUD-3"]);
    expect(filterProductsByQuery(products, "hand-2").map((p) => p.sku)).toEqual(
      ["HAND-2"],
    );
    expect(
      filterProductsByQuery(products, "عطر الورد").map((p) => p.sku),
    ).toEqual(["ROSE-1"]);
  });
  it("returns everything for an empty query", () => {
    expect(filterProductsByQuery(products, "")).toBe(products);
    expect(filterProductsByQuery(products, "   ")).toBe(products);
  });
});

describe("search_results_grid — server-side filtering", () => {
  it("paints only the matching products in the SSR markup", () => {
    const html = render("عطر الورد");
    expect(html).toContain("عطر الورد");
    expect(html).not.toContain("كريم اليدين");
    expect(html).not.toContain("Oud Intense");
    // Result count line via formatCount (Arabic singular form).
    expect(html).toContain("نتيجة واحدة لـ &quot;عطر الورد&quot;");
  });

  it("prefills the search form with the query and posts to the store's /search", () => {
    const html = render("عطر");
    expect(html).toMatch(/<input[^>]*name="q"[^>]*value="عطر"/);
    expect(html).toContain('action="/s/acme/search"');
    expect(html).toContain("<h1");
  });

  it("lists the whole catalogue when there is no query", () => {
    const html = render(undefined);
    expect(html).toContain("عطر الورد");
    expect(html).toContain("كريم اليدين");
    expect(html).toContain("Oud Intense");
    expect(html).not.toContain("نتيجة");
  });

  it("renders the empty state with the searched term when nothing matches", () => {
    const html = render("zzz");
    expect(html).toContain("لا توجد منتجات تطابق بحثك.");
    expect(html).toContain("بحثت عن: &quot;zzz&quot;");
    expect(html).not.toContain("عطر الورد");
  });
});
