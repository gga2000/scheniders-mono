// The product finder asks about the merchant's attributes, so it renders
// nothing unless the products the route hands it carry them. Attributes
// cost an extra query and are loaded on demand — these tests pin that
// every route the finder may sit on asks for them when it does.

import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  emptyStoreConfigV2,
  parseProductAttributeDefs,
  resolveProductAttributes,
  type SectionInstance,
  type StoreConfigV2,
} from "@scheniders/shared";
import { getSection } from "@scheniders/sections";
import type { V2Page as V2PageComponent } from "@/components/v2-page";
import type { SchneidersPreviewLiveRenderer as LiveRendererComponent } from "@/components/schneiders-preview-live-renderer";
import type { Product, Tenant } from "@/lib/types";

const DEFS = parseProductAttributeDefs([
  {
    id: "d1",
    key: "scent_family",
    kind: "enum",
    display_order: 0,
    name_i18n: { ar: "العائلة" },
    options: [{ value: "oriental", label_i18n: { ar: "شرقي" } }],
  },
]);

const BARE: Product = {
  id: "p1",
  tenant_id: "t1",
  name: "عطر العود",
  description: null,
  price: 30000,
  compare_at_price: null,
  image_url: null,
  sku: null,
  stock_quantity: 3,
  reserved_quantity: 0,
  is_archived: false,
};

const WITH_ATTRIBUTES: Product = {
  ...BARE,
  attributes: resolveProductAttributes(DEFS, [
    { product_id: "p1", attribute_def_id: "d1", value: "oriental" },
  ]),
};

// Mirrors lib/queries: attributes arrive only when the caller asks.
const queries = vi.hoisted(() => ({
  listProducts: vi.fn(),
}));

let currentTenant: Tenant;

vi.mock("@/lib/tenant", () => ({
  getTenantBySlug: async () => currentTenant,
  getTenantByCustomDomain: async () => currentTenant,
  getTenantForPreview: async () => currentTenant,
  getTenantByCustomDomainForPreview: async () => currentTenant,
}));

vi.mock("@/lib/queries", () => ({
  listProducts: queries.listProducts,
  listCategories: async () => [],
  listCategoryProductIds: async () => ({}),
  getTenantPublicStats: async () => null,
  getMaxDiscountPercent: async () => null,
  getProductBySlug: async () => null,
  getCategoryBySlug: async () => null,
}));

vi.mock("@/lib/seo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/seo")>()),
  getStorefrontBase: async () => ({ origin: "", storeBase: "", baseUrl: "" }),
}));

vi.mock("@/templates/registry", () => ({
  getTemplate: () => () => null,
}));

// V2Page reads cookies/headers; the body it renders is RenderPage, so the
// stand-in renders exactly that with the context the route built.
vi.mock("@/components/v2-page", async () => {
  const { RenderPage, toSectionTenant } = await import("@scheniders/sections");
  const { StoreBaseProvider } = await import("@/lib/store-context");
  return {
    V2Page: ({ page, runtime, renderCtx }: Parameters<typeof V2PageComponent>[0]) => (
      <StoreBaseProvider base="">
        <RenderPage
          page={page}
          runtime={runtime}
          renderCtx={{ ...renderCtx, tenant: toSectionTenant(renderCtx.tenant) }}
        />
      </StoreBaseProvider>
    ),
  };
});

vi.mock("@/components/schneiders-preview-live-renderer", async () => {
  const { RenderPage } = await import("@scheniders/sections");
  return {
    SchneidersPreviewLiveRenderer: ({
      initialPageConfig,
      initialRuntime,
      renderCtx,
    }: Parameters<typeof LiveRendererComponent>[0]) => (
      <RenderPage page={initialPageConfig} runtime={initialRuntime} renderCtx={renderCtx} />
    ),
  };
});

vi.mock("@/components/schneiders-preview-bridge", () => ({
  SchneidersPreviewBridge: () => null,
}));

const finderDefinition = getSection("product_finder");
if (!finderDefinition) throw new Error("product_finder is not registered");

const FINDER: SectionInstance = {
  id: "finder",
  type: "product_finder",
  enabled: true,
  base: finderDefinition.defaultProps as Record<string, unknown>,
};

const ABOUT_BLOCK: SectionInstance = {
  id: "about",
  type: "about_block",
  enabled: true,
  base: {},
};

const FINDER_HEADING = "لكَّي عطرك";

function tenantWith(configure: (v2: StoreConfigV2) => void): Tenant {
  const v2 = emptyStoreConfigV2();
  v2.default_locale = "ar";
  v2.enabled_locales = ["ar"];
  configure(v2);
  return {
    id: "t1",
    business_name: "متجر العطور",
    slug: "shop",
    status: "active",
    branding: {},
    store_config_v2: v2,
  };
}

function onPage(pageId: string, sections: SectionInstance[]) {
  return (v2: StoreConfigV2) => {
    const page = v2.pages.find((p) => p.page_id === pageId);
    if (!page) throw new Error(`no ${pageId} page in the empty config`);
    page.sections = sections;
  };
}

function attributeRequests(): boolean[] {
  return queries.listProducts.mock.calls.map(
    (call: unknown[]) =>
      (call[1] as { withAttributes?: boolean } | undefined)?.withAttributes === true,
  );
}

beforeEach(() => {
  queries.listProducts.mockReset();
  queries.listProducts.mockImplementation(
    async (_tenantId: string, opts: { withAttributes?: boolean } = {}) => [
      opts.withAttributes ? WITH_ATTRIBUTES : BARE,
    ],
  );
});

describe("product finder on the home page", () => {
  it("loads attributes and shows the finder when the home page hosts it", async () => {
    currentTenant = tenantWith(onPage("home", [FINDER]));
    const { default: StorefrontHome } = await import("./page");
    const tree = await StorefrontHome({
      params: Promise.resolve({ tenant: "shop" }),
      searchParams: Promise.resolve({}),
    });
    expect(attributeRequests()).toEqual([true]);
    expect(renderToStaticMarkup(tree)).toContain(FINDER_HEADING);
  });

  it("skips the attribute query when nothing on the home page reads it", async () => {
    currentTenant = tenantWith(onPage("home", [ABOUT_BLOCK]));
    const { default: StorefrontHome } = await import("./page");
    await StorefrontHome({
      params: Promise.resolve({ tenant: "shop" }),
      searchParams: Promise.resolve({}),
    });
    expect(attributeRequests()).toEqual([false]);
  });
});

describe("product finder on the about page", () => {
  it("loads attributed products and shows the finder", async () => {
    currentTenant = tenantWith(onPage("about", [FINDER]));
    const { default: AboutPage } = await import("./about/page");
    const tree = await AboutPage({ params: Promise.resolve({ tenant: "shop" }) });
    expect(attributeRequests()).toEqual([true]);
    expect(renderToStaticMarkup(tree)).toContain(FINDER_HEADING);
  });

  it("loads no products when nothing on the about page shows them", async () => {
    currentTenant = tenantWith(onPage("about", [ABOUT_BLOCK]));
    const { default: AboutPage } = await import("./about/page");
    await AboutPage({ params: Promise.resolve({ tenant: "shop" }) });
    expect(attributeRequests()).toEqual([]);
  });
});

describe("product finder on a custom page", () => {
  it("loads attributes and shows the finder", async () => {
    currentTenant = tenantWith((v2) => {
      v2.custom_pages = [{ id: "c1", slug: "guide", sections: [FINDER] }];
    });
    const { default: CustomPage } = await import("./p/[slug]/page");
    const tree = await CustomPage({
      params: Promise.resolve({ tenant: "shop", slug: "guide" }),
    });
    expect(attributeRequests()).toEqual([true]);
    expect(renderToStaticMarkup(tree)).toContain(FINDER_HEADING);
  });
});

describe("product finder in the editor preview", () => {
  // The editor pushes section edits into the preview over postMessage
  // without a reload, so the preview cannot decide from the sections it
  // loaded with: a finder added a second later must still have answers.
  it.each(["home", "search", "category", "about"])(
    "loads attributes on %s even before the finder is added",
    async (pageId) => {
      currentTenant = tenantWith(onPage(pageId, [ABOUT_BLOCK]));
      const { default: PreviewPage } = await import(
        "../../%5Fpreview/[tenant]/[page_id]/page"
      );
      await PreviewPage({
        params: Promise.resolve({ tenant: "shop", page_id: pageId }),
        searchParams: Promise.resolve({ token: "dev-preview-token", locale: "ar" }),
      });
      expect(attributeRequests()).toEqual([true]);
    },
  );

  it("shows the finder on the home preview", async () => {
    currentTenant = tenantWith(onPage("home", [FINDER]));
    const { default: PreviewPage } = await import(
      "../../%5Fpreview/[tenant]/[page_id]/page"
    );
    const tree = await PreviewPage({
      params: Promise.resolve({ tenant: "shop", page_id: "home" }),
      searchParams: Promise.resolve({ token: "dev-preview-token", locale: "ar" }),
    });
    expect(renderToStaticMarkup(tree)).toContain(FINDER_HEADING);
  });
});
