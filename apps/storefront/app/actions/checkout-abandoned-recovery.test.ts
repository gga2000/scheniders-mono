// =====================================================================
// A real storefront order marks that phone's open capture recovered:
// in its own store only, never twice, never for the merchant's draft-view
// test order. A failed write is logged and never fails the order. Whether
// the recovery came after a reminder is derived in the database
// (abandoned_carts.recovery_kind), so this code writes recovered_at only.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signPreviewToken } from "@scheniders/shared/preview-token";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/capi", () => ({
  sendPurchaseCapi: vi.fn(),
}));
// P1's QStash hand-off runs in next/server `after`; it is not under test here.
vi.mock("@/lib/order-confirmation-queue", () => ({
  queueOrderConfirmation: vi.fn(),
}));

import { cookies, headers } from "next/headers";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { submitCheckout } from "@/app/actions/checkout";
import { DRAFT_VIEW_COOKIE } from "@/lib/draft-view";
import { createFakeSupabase, type FakeSupabase, type Row } from "@/lib/testing/fake-supabase";

const TENANT_ID = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT_ID = "9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0";
const PRODUCT_ID = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const ORDER_UUID = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";
const PHONE = "07701234567";
const SECRET = "test-preview-secret";

function jar(draftToken: string | undefined): void {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => {
      if (name === DRAFT_VIEW_COOKIE && draftToken !== undefined) return { name, value: draftToken };
      return undefined;
    },
  } as never);
  vi.mocked(headers).mockResolvedValue(new Headers() as never);
}

function install(carts: Row[], failingTables: string[] = []): FakeSupabase {
  const fake = createFakeSupabase(
    {
      tenants: [{ id: TENANT_ID, status: "active", restrictions: null, store_config_v2: null }],
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
      abandoned_carts: carts,
      customer_points: [],
      orders: [],
    },
    {
      failingTables,
      rpc: {
        // P2.3 moved submitCheckout to the duplicate-guarded wrapper; P3 runs
        // after P2, so this is the RPC the checkout actually calls.
        create_storefront_order: () => ({
          data: { id: ORDER_UUID, order_id: "4261021001" },
          error: null,
        }),
      },
    },
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const checkout = () =>
  submitCheckout({
    tenantId: TENANT_ID,
    customer: {
      customer_name: "Ali Hassan",
      phone: PHONE,
      governorate_code: "BG",
      city: "Baghdad",
      address_details: "Street 14",
    },
    items: [
      { product_id: PRODUCT_ID, variant_id: null, name: "P", variant_name: null, price: 1000, quantity: 1 },
    ],
  });

const cart = (fake: FakeSupabase, tenantId: string): Row | undefined =>
  fake.tables.abandoned_carts.find((r) => r.tenant_id === tenantId && r.phone === PHONE);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PREVIEW_TOKEN_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("submitCheckout marks the phone's capture recovered", () => {
  it("in this store only", async () => {
    jar(undefined);
    const fake = install([
      { id: "own", tenant_id: TENANT_ID, phone: PHONE, recovered_at: null, reminded_at: null },
      { id: "other", tenant_id: OTHER_TENANT_ID, phone: PHONE, recovered_at: null, reminded_at: null },
    ]);
    const res = await checkout();
    expect(res.success).toBe(true);
    expect(typeof cart(fake, TENANT_ID)?.recovered_at).toBe("string");
    expect(cart(fake, OTHER_TENANT_ID)?.recovered_at).toBeNull();
  });

  it("keeps the first recovery time of a capture already recovered", async () => {
    jar(undefined);
    const fake = install([
      { id: "own", tenant_id: TENANT_ID, phone: PHONE, recovered_at: "2026-10-01T00:00:00.000Z", reminded_at: null },
    ]);
    await checkout();
    expect(cart(fake, TENANT_ID)?.recovered_at).toBe("2026-10-01T00:00:00.000Z");
  });

  it("recovers nothing for the merchant's draft-view test order", async () => {
    jar(signPreviewToken({ tenant_id: TENANT_ID }, SECRET, 600));
    const fake = install([
      { id: "own", tenant_id: TENANT_ID, phone: PHONE, recovered_at: null, reminded_at: null },
    ]);
    const res = await checkout();
    expect(res.success).toBe(true);
    expect(cart(fake, TENANT_ID)?.recovered_at).toBeNull();
    expect(fake.writes.filter((w) => w.table === "abandoned_carts")).toEqual([]);
  });

  it("logs a failed write with the order id and still places the order", async () => {
    jar(undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    install([], ["abandoned_carts"]);
    const res = await checkout();
    expect(res.success).toBe(true);
    expect(
      errorSpy.mock.calls.some(
        ([msg]) =>
          String(msg).includes("could not mark abandoned cart recovered") &&
          String(msg).includes(ORDER_UUID),
      ),
    ).toBe(true);
    errorSpy.mockRestore();
  });
});
