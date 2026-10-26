// =====================================================================
// Draft view — the guards that keep the merchant's own preview traffic
// out of their ad accounts, experiments and order stats.
// =====================================================================
// draft-view.test.ts covers how the flag is WORKED OUT. These tests cover
// what the flag is supposed to STOP, at each place it acts:
//   - submitCheckout: no server-side CAPI Purchase, and the order row is
//     flagged is_test (tenant-scoped) with an unchanged RPC payload
//   - TenantLayout: the browser ad pixels are not mounted
//   - V2Page: no experiment exposure beacon
// Each case pairs a draft-view request with a shopper request so a guard
// that is removed OR inverted fails here.
// =====================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { signPreviewToken } from "@scheniders/shared/preview-token";
import type { PageConfig, RuntimeContext, StoreConfigV2 } from "@scheniders/shared";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/capi", () => ({
  sendPurchaseCapi: vi.fn(),
}));
vi.mock("@/lib/tenant", () => ({
  getTenantBySlug: vi.fn(),
  getTenantByCustomDomain: vi.fn(),
}));
vi.mock("@/components/schneiders/analytics-pixels", () => ({
  SchneidersAnalyticsPixels: () => null,
}));
vi.mock("@/components/schneiders/newsletter-popup", () => ({
  SchneidersNewsletterPopup: () => null,
}));
vi.mock("@/components/cart-hydrator", () => ({ CartHydrator: () => null }));
vi.mock("@/components/html-lang", () => ({ HtmlLang: () => null }));
vi.mock("@/lib/store-context", () => ({
  StoreBaseProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@scheniders/sections", () => ({
  RenderPage: () => null,
  toSectionTenant: <T,>(t: T): T => t,
}));
vi.mock("@/components/experiment-beacon", () => ({ ExperimentBeacon: () => null }));
vi.mock("@/components/funnel-beacon", () => ({ FunnelBeacon: () => null }));
vi.mock("@/components/storefront-globals", () => ({ StorefrontGlobals: () => null }));
vi.mock("@/components/cart-signal", () => ({ CartSignal: () => null }));
vi.mock("@/components/section-reveal", () => ({ SectionReveal: () => null }));

import { cookies, headers } from "next/headers";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendPurchaseCapi } from "@/lib/capi";
import { getTenantBySlug } from "@/lib/tenant";
import { SchneidersAnalyticsPixels } from "@/components/schneiders/analytics-pixels";
import { ExperimentBeacon } from "@/components/experiment-beacon";
import { FunnelBeacon } from "@/components/funnel-beacon";
import { submitCheckout } from "@/app/actions/checkout";
import TenantLayout from "@/app/s/[tenant]/layout";
import { V2Page } from "@/components/v2-page";
import { DRAFT_VIEW_COOKIE } from "./draft-view";
import { createFakeSupabase, type FakeSupabase } from "./testing/fake-supabase";
import type { Tenant } from "./types";

const TENANT_ID = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PRODUCT_ID = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const ORDER_UUID = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";
const OTHER_TENANT_ID = "9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0";
const SECRET = "test-preview-secret";

const ANALYTICS = { meta_pixel_id: "123", meta_capi_token: "tok" };

/** A cookie jar holding the visitor key and, optionally, a draft-view token. */
function jar(draftToken: string | undefined): void {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => {
      if (name === "sb_vid") return { name, value: "visitor-abc" };
      if (name === DRAFT_VIEW_COOKIE && draftToken !== undefined) {
        return { name, value: draftToken };
      }
      return undefined;
    },
  } as never);
  vi.mocked(headers).mockResolvedValue(new Headers() as never);
}
const draftToken = () => signPreviewToken({ tenant_id: TENANT_ID }, SECRET, 600);

/** Depth-first search of a server component's returned element tree. */
function findElement(node: ReactNode, type: unknown): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node;
  const props = node.props as { children?: ReactNode };
  return findElement(props.children, type);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PREVIEW_TOKEN_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── submitCheckout ──────────────────────────────────────────────────
describe("submitCheckout in draft view", () => {
  // The in-memory PostgREST double the other checkout tests use: it applies
  // the query filters, so the is_test write only lands on rows the code
  // actually scoped to — another tenant's row under the same id stays put
  // unless the tenant filter is missing.
  function install() {
    const fake = createFakeSupabase(
      {
        tenants: [
          {
            id: TENANT_ID,
            status: "active",
            restrictions: null,
            store_config_v2: { globals: { analytics_pixels: { base: ANALYTICS } } },
          },
        ],
        products: [
          {
            id: PRODUCT_ID,
            tenant_id: TENANT_ID,
            name: "P",
            short_name: null,
            price: 1000,
            website_price: null,
            status: "active",
            is_visible: true,
            is_archived: false,
            is_supply: false,
          },
        ],
        product_variants: [],
        product_tiered_pricing: [],
        product_order_bumps: [],
        abandoned_carts: [],
        customer_points: [],
        orders: [
          { id: ORDER_UUID, tenant_id: TENANT_ID, is_test: false },
          { id: ORDER_UUID, tenant_id: OTHER_TENANT_ID, is_test: false },
        ],
      },
      {
        rpc: {
          create_storefront_order: () => ({
            data: { id: ORDER_UUID, order_id: "4261020001" },
            error: null,
          }),
        },
      },
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
    return fake;
  }

  const orderWrites = (fake: FakeSupabase) =>
    fake.writes.filter((w) => w.table === "orders");
  const isTest = (fake: FakeSupabase, tenantId: string) =>
    fake.tables.orders.find((r) => r.tenant_id === tenantId)?.is_test;

  const checkout = () =>
    submitCheckout({
      tenantId: TENANT_ID,
      purchaseEventId: "evt-1",
      customer: {
        customer_name: "Ali Hassan",
        phone: "07701234567",
        governorate_code: "BG",
        city: "Baghdad",
        address_details: "Street 14",
      },
      items: [
        {
          product_id: PRODUCT_ID,
          variant_id: null,
          name: "P",
          variant_name: null,
          price: 1000,
          quantity: 1,
        },
      ],
    });

  it("a shopper's order sends one CAPI Purchase and is not flagged as a test", async () => {
    jar(undefined);
    const fake = install();
    const res = await checkout();
    expect(res.success).toBe(true);
    expect(sendPurchaseCapi).toHaveBeenCalledTimes(1);
    expect(orderWrites(fake)).toEqual([]);
    expect(isTest(fake, TENANT_ID)).toBe(false);
  });

  it("a draft-view order sends no CAPI Purchase and is flagged is_test, tenant-scoped", async () => {
    jar(draftToken());
    const fake = install();
    const res = await checkout();
    expect(res.success).toBe(true);
    expect(sendPurchaseCapi).not.toHaveBeenCalled();
    expect(orderWrites(fake)).toEqual([
      { table: "orders", op: "update", payload: { is_test: true }, matched: 1 },
    ]);
    expect(isTest(fake, TENANT_ID)).toBe(true);
    expect(isTest(fake, OTHER_TENANT_ID)).toBe(false);
  });

  it("the create_storefront_order payload is identical for both", async () => {
    const orderArgs = (fake: FakeSupabase) =>
      fake.rpcCalls.filter((c) => c.fn === "create_storefront_order").map((c) => c.args);
    jar(undefined);
    const shopper = install();
    await checkout();
    jar(draftToken());
    const draft = install();
    await checkout();
    expect(orderArgs(shopper)).toHaveLength(1);
    expect(orderArgs(draft)).toEqual(orderArgs(shopper));
  });
});

// ─── TenantLayout ────────────────────────────────────────────────────
describe("TenantLayout ad pixels", () => {
  function tenant(overrides: Partial<Tenant> = {}): Tenant {
    return {
      id: TENANT_ID,
      business_name: "Store",
      slug: "store",
      status: "active",
      store_config: null,
      branding: null,
      store_config_v2: { globals: { analytics_pixels: { base: ANALYTICS } } },
      ...overrides,
    } as unknown as Tenant;
  }
  const render = async () =>
    TenantLayout({ params: Promise.resolve({ tenant: "store" }), children: null });

  it("mounts the pixels for a shopper", async () => {
    jar(undefined);
    vi.mocked(getTenantBySlug).mockResolvedValue(tenant());
    const pixels = findElement(await render(), SchneidersAnalyticsPixels);
    expect(pixels).not.toBeNull();
    expect((pixels?.props as { analytics: Record<string, string> }).analytics).toMatchObject(
      ANALYTICS,
    );
  });

  it("does not mount them in draft view", async () => {
    jar(draftToken());
    vi.mocked(getTenantBySlug).mockResolvedValue(tenant({ is_draft_view: true }));
    expect(findElement(await render(), SchneidersAnalyticsPixels)).toBeNull();
  });
});

// ─── V2Page ──────────────────────────────────────────────────────────
describe("V2Page experiment exposure", () => {
  const v2 = {
    experiments: [
      { id: "exp", status: "running", arms: [{ id: "arm", traffic_pct: 100 }] },
    ],
  } as unknown as StoreConfigV2;
  const runtime = {
    page_id: "home",
    breakpoint: "mobile",
    locale: "ar",
    audience_segments: [],
    ab_test_arms: {},
    now: new Date("2026-10-20T00:00:00Z"),
  } as unknown as RuntimeContext;
  const render = async () =>
    V2Page({
      v2,
      page: { page_id: "home", sections: [] } as unknown as PageConfig,
      runtime,
      renderCtx: {
        tenant: { id: TENANT_ID } as never,
        products: [],
        categories: [],
      } as never,
    });

  it("records an exposure for a shopper", async () => {
    jar(undefined);
    const beacon = findElement(await render(), ExperimentBeacon);
    expect(beacon).not.toBeNull();
    expect(beacon?.props).toEqual({ tenantId: TENANT_ID, arms: { exp: "arm" } });
  });

  it("still assigns the arm but records no exposure in draft view", async () => {
    jar(draftToken());
    expect(findElement(await render(), ExperimentBeacon)).toBeNull();
  });

  it("counts a shopper's page view in the purchase funnel", async () => {
    jar(undefined);
    expect(findElement(await render(), FunnelBeacon)).not.toBeNull();
  });

  it("keeps a draft-view page view out of the purchase funnel", async () => {
    jar(draftToken());
    expect(findElement(await render(), FunnelBeacon)).toBeNull();
  });
});
