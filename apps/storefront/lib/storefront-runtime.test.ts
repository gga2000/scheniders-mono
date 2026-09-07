import { describe, it, expect } from "vitest";
import type { StoreConfigV2, PageConfig } from "@scheniders/shared";
import {
  buildRuntimeContext,
  deriveCatalogPage,
  pickV2Page,
  resolveOrderNumber,
  resolveSearchQuery,
  resolveTenantKeyFromHeaders,
  SEARCH_QUERY_MAX_LENGTH,
} from "./storefront-runtime";

describe("buildRuntimeContext", () => {
  it("defaults to mobile/SSR-safe runtime for the home page", () => {
    const now = new Date("2026-06-04T00:00:00Z");
    const ctx = buildRuntimeContext({ pageId: "home", locale: "ar", now });
    expect(ctx).toMatchObject({
      page_id: "home",
      breakpoint: "mobile",
      locale: "ar",
      audience_segments: [],
      ab_test_arms: {},
      now,
    });
  });
  it("passes through optional ids", () => {
    const ctx = buildRuntimeContext({
      pageId: "product",
      locale: "en",
      now: new Date(0),
      productId: "p1",
    });
    expect(ctx.product_id).toBe("p1");
    expect(ctx.page_id).toBe("product");
  });
  it("carries the order number and search query into the runtime", () => {
    const ctx = buildRuntimeContext({
      pageId: "checkout_success",
      locale: "ar",
      now: new Date(0),
      orderNumber: "SCH-1042",
      searchQuery: "عطر",
    });
    expect(ctx.order_number).toBe("SCH-1042");
    expect(ctx.search_query).toBe("عطر");
  });
  it("omits the keys entirely when order/search are empty", () => {
    const ctx = buildRuntimeContext({
      pageId: "search",
      locale: "ar",
      now: new Date(0),
      searchQuery: "",
      orderNumber: "",
    });
    expect("order_number" in ctx).toBe(false);
    expect("search_query" in ctx).toBe(false);
  });
});

describe("resolveSearchQuery", () => {
  it("trims, collapses whitespace and takes the first repeated value", () => {
    expect(resolveSearchQuery("  عطر   رجالي ")).toBe("عطر رجالي");
    expect(resolveSearchQuery(["first", "second"])).toBe("first");
  });
  it("returns an empty string for missing input", () => {
    expect(resolveSearchQuery(undefined)).toBe("");
    expect(resolveSearchQuery("   ")).toBe("");
  });
  it("caps the length", () => {
    expect(resolveSearchQuery("x".repeat(500))).toHaveLength(
      SEARCH_QUERY_MAX_LENGTH,
    );
  });
});

describe("resolveOrderNumber", () => {
  it("keeps plain order tokens", () => {
    expect(resolveOrderNumber("SCH-1042")).toBe("SCH-1042");
    expect(resolveOrderNumber(" #10042 ")).toBe("#10042");
    expect(resolveOrderNumber(["A1", "B2"])).toBe("A1");
  });
  it("rejects markup-looking or empty values", () => {
    expect(resolveOrderNumber("<script>")).toBe("");
    expect(resolveOrderNumber("10 42")).toBe("");
    expect(resolveOrderNumber(undefined)).toBe("");
  });
});

/** Build a minimal StoreConfigV2 fixture with only the fields pickV2Page needs. */
function makeV2(
  pages: PageConfig[],
  extra: Partial<StoreConfigV2> = {},
): StoreConfigV2 {
  return { pages, ...extra } as StoreConfigV2;
}

describe("pickV2Page", () => {
  it("returns the page when it has sections", () => {
    const page: PageConfig = {
      page_id: "home",
      sections: [{ id: "a", type: "hero_image", enabled: true, base: {} }],
    };
    expect(pickV2Page(makeV2([page]), "home")).toBe(page);
  });
  it("returns null for an empty page (falls back to legacy)", () => {
    const page: PageConfig = { page_id: "home", sections: [] };
    expect(pickV2Page(makeV2([page]), "home")).toBeNull();
  });
  it("returns null when the page is absent", () => {
    const page: PageConfig = {
      page_id: "about",
      sections: [{ id: "x", type: "t", enabled: true, base: {} }],
    };
    expect(pickV2Page(makeV2([page]), "home")).toBeNull();
  });
  it("returns null for null config", () => {
    expect(pickV2Page(null, "home")).toBeNull();
  });

  it("returns null (no crash) when pages is malformed — EC7", () => {
    expect(
      pickV2Page({ pages: {} } as unknown as StoreConfigV2, "home"),
    ).toBeNull();
    expect(
      pickV2Page({ pages: "oops" } as unknown as StoreConfigV2, "home"),
    ).toBeNull();
    expect(pickV2Page({} as unknown as StoreConfigV2, "home")).toBeNull();
  });

  it("returns null (no crash) when a page's sections is non-array — EC7", () => {
    const page = { page_id: "home", sections: {} } as unknown as PageConfig;
    expect(pickV2Page(makeV2([page]), "home")).toBeNull();
  });
});

describe("deriveCatalogPage (P0-3)", () => {
  const categoryGrid = {
    id: "tpl_category_1",
    type: "product_grid",
    enabled: true,
    base: {
      mode: "manual",
      query: { sort: "newest", limit: 24, category_slug: "perfumes" },
      card_style: "price_pill",
      show_stars: true,
      eyebrow_i18n: { ar: "المجموعة", en: "The collection" },
      heading_i18n: { ar: "منتجاتنا", en: "Our products" },
      manual_product_ids: ["p1"],
    },
    variants: [
      {
        id: "v1",
        label: "en",
        conditions: [],
        overrides: { heading_i18n: { en: "Other" } },
      },
    ],
  } as unknown as PageConfig["sections"][number];

  it("clones the category grid's base, lifts the limit and retitles it", () => {
    const v2 = makeV2([
      {
        page_id: "category",
        sections: [
          { id: "x", type: "trust_badge_row", enabled: true, base: {} },
          categoryGrid,
        ],
      },
    ]);
    const page = deriveCatalogPage(v2);
    expect(page.page_id).toBe("category");
    expect(page.sections).toHaveLength(1);
    const [grid] = page.sections;
    expect(grid.type).toBe("product_grid");
    expect(grid.enabled).toBe(true);
    expect(grid.base).toMatchObject({
      mode: "auto",
      query: { sort: "newest" },
      card_style: "price_pill",
      show_stars: true,
      eyebrow_i18n: { ar: "المجموعة", en: "The collection" },
      heading_i18n: { ar: "كل المنتجات", en: "All products" },
    });
    expect((grid.base.query as Record<string, unknown>).limit).toBeUndefined();
    expect(
      (grid.base.query as Record<string, unknown>).category_slug,
    ).toBeUndefined();
    // Only `base` is cloned — category-page variants must not leak.
    expect("variants" in grid).toBe(false);
    // The source instance is left untouched.
    expect((categoryGrid.base.query as Record<string, unknown>).limit).toBe(24);
  });

  it("skips a disabled grid and falls back when the category page has none", () => {
    const disabled = { ...categoryGrid, enabled: false };
    const v2 = makeV2([{ page_id: "category", sections: [disabled] }]);
    const page = deriveCatalogPage(v2);
    expect(page.sections[0].base).toMatchObject({
      mode: "auto",
      query: { sort: "newest" },
    });
    expect(page.sections[0].base.card_style).toBeUndefined();
  });

  it("fallback uses price_pill only for calm kits (rotation none)", () => {
    const calm = makeV2([], {
      brand_kit: { shape: { rotation_intensity: "none" } },
    } as unknown as Partial<StoreConfigV2>);
    expect(deriveCatalogPage(calm).sections[0].base.card_style).toBe(
      "price_pill",
    );
    const playful = makeV2([], {
      brand_kit: { shape: { rotation_intensity: "playful" } },
    } as unknown as Partial<StoreConfigV2>);
    expect(
      deriveCatalogPage(playful).sections[0].base.card_style,
    ).toBeUndefined();
    expect(
      deriveCatalogPage(makeV2([])).sections[0].base.card_style,
    ).toBeUndefined();
  });
});

describe("resolveTenantKeyFromHeaders (404 tenant recovery)", () => {
  const rootDomain = "scheniders.com";
  it("path mode: reads the slug from x-store-base", () => {
    expect(
      resolveTenantKeyFromHeaders({
        storeBase: "/s/acme",
        host: "scheniders.com",
        rootDomain,
      }),
    ).toBe("acme");
    expect(
      resolveTenantKeyFromHeaders({
        storeBase: "/s/acme/products",
        host: null,
        rootDomain,
      }),
    ).toBe("acme");
  });
  it("subdomain mode: derives the slug from the host", () => {
    expect(
      resolveTenantKeyFromHeaders({
        storeBase: "",
        host: "acme.scheniders.com",
        rootDomain,
      }),
    ).toBe("acme");
    expect(
      resolveTenantKeyFromHeaders({
        storeBase: "",
        host: "acme.localhost:3001",
        rootDomain: "localhost:3001",
      }),
    ).toBe("acme");
  });
  it("custom domain: returns the __domain__ key", () => {
    expect(
      resolveTenantKeyFromHeaders({
        storeBase: "",
        host: "shop.example.iq",
        rootDomain,
      }),
    ).toBe("__domain__shop.example.iq");
  });
  it("root / www host or nothing at all → null", () => {
    expect(
      resolveTenantKeyFromHeaders({
        storeBase: null,
        host: "scheniders.com",
        rootDomain,
      }),
    ).toBeNull();
    expect(
      resolveTenantKeyFromHeaders({
        storeBase: null,
        host: "www.scheniders.com",
        rootDomain,
      }),
    ).toBeNull();
    expect(
      resolveTenantKeyFromHeaders({ storeBase: null, host: null, rootDomain }),
    ).toBeNull();
    expect(
      resolveTenantKeyFromHeaders({ storeBase: "/s/", host: null, rootDomain }),
    ).toBeNull();
  });
  it("decodes a percent-encoded slug and drops a malformed one", () => {
    expect(
      resolveTenantKeyFromHeaders({
        storeBase: "/s/%D9%85%D8%AA%D8%AC%D8%B1",
        host: null,
        rootDomain,
      }),
    ).toBe("متجر");
    expect(
      resolveTenantKeyFromHeaders({
        storeBase: "/s/%E0%A4%A",
        host: null,
        rootDomain,
      }),
    ).toBeNull();
  });
});
