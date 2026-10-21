import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/route-guards", () => ({
  resolveStoreTenant: vi.fn(),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, consumeRateLimit: vi.fn() };
});

import { POST } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { resolveStoreTenant } from "@/lib/route-guards";
import { consumeRateLimit } from "@/lib/rate-limit";
import { DUPLICATE_ORDER_WINDOW_MINUTES } from "@/lib/order-duplicate-guard";
import {
  createFakeSupabase,
  type FakeSupabase,
  type FakeSupabaseOptions,
  type Row,
} from "@/lib/testing/fake-supabase";
import type { Tenant } from "@/lib/types";

// The route decides WHAT a capture is (store, phone, catalogue lines,
// consent) and hands it to capture_abandoned_cart. What that does to an
// existing row (keep an open row's reminder and consent, leave a fresh
// recovery alone, reopen an old one) is SQL, verified against the live
// database in migration 20261022000000's scenarios; here the double
// records the call.

const TENANT_ID = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT_ID = "9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0";
const PRODUCT_ID = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const SIZED_PRODUCT_ID = "d4e5f6a7-b8c9-4012-9e45-f6a7b8c9d0e1";
const OTHER_PRODUCT_ID = "b2c3d4e5-f6a7-4890-bc23-de45f6a7b8c9";
const VARIANT_ID = "c3d4e5f6-a7b8-4901-8d34-ef56a7b8c9d0";
const DISABLED_VARIANT_ID = "e5f6a7b8-c9d0-4123-8f56-a7b8c9d0e1f2";
const CONSENT = "ممكن نراسلك واتساب بخصوص طلبك";
const ALLOW = { allowed: true, remaining: 10, retryAfterSeconds: 0 };
const DENY = { allowed: false, remaining: 0, retryAfterSeconds: 42 };

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: TENANT_ID,
    business_name: "Store",
    slug: "shop",
    status: "active",
    ...overrides,
  } as unknown as Tenant;
}

function req(
  body: unknown,
  headers: Record<string, string> = {},
  omit: readonly string[] = [],
): Request {
  const h = new Headers({
    "content-type": "application/json",
    host: "shop.scheniders.test",
    "x-forwarded-for": "1.2.3.4",
    ...headers,
  });
  for (const name of omit) h.delete(name);
  return new Request("https://shop.scheniders.test/api/cart/abandoned", {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
}

const product = (id: string, tenantId: string, name: string, price: number): Row => ({
  id,
  tenant_id: tenantId,
  name,
  price,
  website_price: null,
  status: "active",
  is_visible: true,
  is_archived: false,
  is_supply: false,
});

function install(options: FakeSupabaseOptions = {}): FakeSupabase {
  const fake = createFakeSupabase(
    {
      products: [
        product(PRODUCT_ID, TENANT_ID, "عطر", 25000),
        // Sold by variant: a line for it must name an enabled variant.
        product(SIZED_PRODUCT_ID, TENANT_ID, "قميص", 20000),
        product(OTHER_PRODUCT_ID, OTHER_TENANT_ID, "Other", 9000),
      ],
      product_variants: [
        { id: VARIANT_ID, product_id: SIZED_PRODUCT_ID, tenant_id: TENANT_ID, price: 30000, is_enabled: true },
        {
          id: DISABLED_VARIANT_ID,
          product_id: SIZED_PRODUCT_ID,
          tenant_id: TENANT_ID,
          price: 31000,
          is_enabled: false,
        },
      ],
      abandoned_carts: [],
    },
    {
      ...options,
      rpc: { capture_abandoned_cart: () => ({ data: true, error: null }), ...options.rpc },
    },
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const line = { product_id: PRODUCT_ID, variant_id: null, quantity: 2 };
const phoneKey = (tenantId: string, phone: string): string =>
  createHash("sha256").update(`${tenantId}:${phone}`).digest("hex").slice(0, 32);
const consentVersion = (text: string): string =>
  `sha256:${createHash("sha256").update(text.normalize("NFC")).digest("hex").slice(0, 16)}`;
const captures = (fake: FakeSupabase): Row[] =>
  fake.rpcCalls.filter((c) => c.fn === "capture_abandoned_cart").map((c) => c.args);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "scheniders.test");
  vi.mocked(resolveStoreTenant).mockResolvedValue(tenant());
  vi.mocked(consumeRateLimit).mockResolvedValue(ALLOW);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/cart/abandoned", () => {
  it("400s on an invalid body", async () => {
    const res = await POST(req({ phone: "x", items: [] }));
    expect(res.status).toBe(400);
    expect(resolveStoreTenant).not.toHaveBeenCalled();
  });

  it("no-ops (skipped) on an unmessageable phone", async () => {
    const fake = install();
    const res = await POST(req({ phone: "12345", items: [line] }));
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBe("phone");
    expect(captures(fake)).toEqual([]);
  });

  it("files the capture under the store the host names, never the body's tenant_id", async () => {
    const fake = install();
    const res = await POST(
      req({ tenant_id: OTHER_TENANT_ID, phone: "+964 770 123 4567", items: [line] }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(resolveStoreTenant).toHaveBeenCalledWith("shop");
    expect(captures(fake)).toHaveLength(1);
    expect(captures(fake)[0]).toMatchObject({ _tenant_id: TENANT_ID, _phone: "07701234567" });
    // One atomic write through the function, never a table write from here.
    expect(fake.writes).toEqual([]);
  });

  it("reads a path-based store from the same-origin page on the root domain", async () => {
    install();
    await POST(
      req(
        { phone: "07701234567", items: [line] },
        { host: "scheniders.test", referer: "https://scheniders.test/s/shop/products/x" },
      ),
    );
    expect(resolveStoreTenant).toHaveBeenCalledWith("shop");
  });

  it("400s when the request names no store", async () => {
    const fake = install();
    const res = await POST(req({ phone: "07701234567", items: [line] }, { host: "scheniders.test" }));
    expect(res.status).toBe(400);
    expect(resolveStoreTenant).not.toHaveBeenCalled();
    expect(captures(fake)).toEqual([]);
  });

  it("404s for an unknown store or one that is not live", async () => {
    const fake = install();
    vi.mocked(resolveStoreTenant).mockResolvedValueOnce(null);
    expect((await POST(req({ phone: "07701234567", items: [line] }))).status).toBe(404);
    vi.mocked(resolveStoreTenant).mockResolvedValueOnce(tenant({ status: "suspended" } as Partial<Tenant>));
    expect((await POST(req({ phone: "07701234567", items: [line] }))).status).toBe(404);
    expect(captures(fake)).toEqual([]);
  });

  it("captures nothing for the merchant's own draft-view session", async () => {
    const fake = install();
    vi.mocked(resolveStoreTenant).mockResolvedValueOnce(tenant({ is_draft_view: true }));
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect((await res.json()).skipped).toBe("draft");
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(captures(fake)).toEqual([]);
  });

  it("drops a line for another store's product (nothing left → no row)", async () => {
    const fake = install();
    const res = await POST(
      req({ phone: "07701234567", items: [{ product_id: OTHER_PRODUCT_ID, variant_id: null, quantity: 1 }] }),
    );
    expect((await res.json()).skipped).toBe("items");
    expect(captures(fake)).toEqual([]);
  });

  it("drops lines the checkout would refuse: a disabled variant, another product's variant, no variant for a product sold by variant", async () => {
    const fake = install();
    const res = await POST(
      req({
        phone: "07701234567",
        items: [
          { product_id: SIZED_PRODUCT_ID, variant_id: DISABLED_VARIANT_ID, quantity: 1 },
          { product_id: PRODUCT_ID, variant_id: VARIANT_ID, quantity: 1 },
          { product_id: SIZED_PRODUCT_ID, variant_id: null, quantity: 1 },
        ],
      }),
    );
    expect((await res.json()).skipped).toBe("items");
    expect(captures(fake)).toEqual([]);
  });

  it("prices and names every line from the catalogue, not the client", async () => {
    const fake = install();
    await POST(
      req({
        phone: "07701234567",
        items: [
          { ...line, price: 1, name: "fake" },
          { product_id: SIZED_PRODUCT_ID, variant_id: VARIANT_ID, quantity: 1 },
        ],
        governorate: "BG",
        locale: "ar",
      }),
    );
    expect(captures(fake)[0]).toMatchObject({
      _items: [
        { product_id: PRODUCT_ID, variant_id: null, name: "عطر", quantity: 2, price: 25000 },
        { product_id: SIZED_PRODUCT_ID, variant_id: VARIANT_ID, name: "قميص", quantity: 1, price: 30000 },
      ],
      _subtotal_iqd: 80000,
      _governorate: "BG",
      _locale: "ar",
    });
  });

  it("keeps the first of a repeated product + variant line, so the subtotal is not inflated", async () => {
    const fake = install();
    await POST(req({ phone: "07701234567", items: [line, { ...line, quantity: 5 }] }));
    expect(captures(fake)[0]).toMatchObject({
      _items: [{ product_id: PRODUCT_ID, variant_id: null, name: "عطر", quantity: 2, price: 25000 }],
      _subtotal_iqd: 50000,
    });
  });

  it("accepts the cart checkout_form beacon body unchanged, as a capture without consent", async () => {
    // checkout_form.client.tsx still sends tenant_id, name, price and an
    // empty governorate while none is picked. All of those are ignored or
    // degraded, never trusted, and no consent is recorded. The empty
    // governorate is omitted, so it cannot wipe one an earlier capture
    // recorded (capture_abandoned_cart keeps an open row's governorate).
    const fake = install();
    const res = await POST(
      req({
        tenant_id: OTHER_TENANT_ID,
        phone: "07701234567",
        items: [{ product_id: PRODUCT_ID, variant_id: null, name: "x", quantity: 1, price: 1 }],
        governorate: "",
        locale: "ar",
      }),
    );
    expect(res.status).toBe(200);
    const args = captures(fake)[0];
    expect(args).toMatchObject({ _tenant_id: TENANT_ID, _subtotal_iqd: 25000, _locale: "ar" });
    expect(args).not.toHaveProperty("_governorate");
    expect(args).not.toHaveProperty("_consent_text_version");
  });

  it("records consent as the version of the exact line shown", async () => {
    const fake = install();
    await POST(req({ phone: "07701234567", items: [line], consent_text: CONSENT }));
    expect(captures(fake)[0]._consent_text_version).toBe(consentVersion(CONSENT));
  });

  it("asks the function to keep a recovery younger than the duplicate-order window, and says so when it did", async () => {
    const fake = install({ rpc: { capture_abandoned_cart: () => ({ data: false, error: null }) } });
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect(captures(fake)[0]._reopen_after_seconds).toBe(DUPLICATE_ORDER_WINDOW_MINUTES * 60);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, skipped: "recovered" });
  });

  it("rate-limits per IP and per (store, phone), failing closed, and writes nothing over the limit", async () => {
    const fake = install();
    vi.mocked(consumeRateLimit).mockImplementation(async (key) =>
      key.startsWith("cart-capture:phone:") ? DENY : ALLOW,
    );
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    const calls = vi.mocked(consumeRateLimit).mock.calls;
    expect(calls.map((c) => c[0])).toEqual([
      "cart-capture:ip:1.2.3.4",
      `cart-capture:phone:${phoneKey(TENANT_ID, "07701234567")}`,
    ]);
    for (const c of calls) expect(c[3]).toBe("fail-closed");
    expect(captures(fake)).toEqual([]);
  });

  it("still applies the per-IP limit when the request carries no client address", async () => {
    const fake = install();
    vi.mocked(consumeRateLimit).mockImplementation(async (key) =>
      key === "cart-capture:ip:unknown" ? DENY : ALLOW,
    );
    const res = await POST(req({ phone: "07701234567", items: [line] }, {}, ["x-forwarded-for"]));
    expect(res.status).toBe(429);
    expect(captures(fake)).toEqual([]);
  });

  it("refuses with 429 when the limiter itself cannot answer", async () => {
    // The real consumeRateLimit's fail-closed answer for an outage.
    const fake = install();
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 0 });
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1");
    expect(captures(fake)).toEqual([]);
  });

  it("500s, logged, when the catalogue cannot be read", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = install({ failingTables: ["products"] });
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    expect(captures(fake)).toEqual([]);
    errorSpy.mockRestore();
  });

  it("500s, logged, when it cannot tell which products are sold by variant", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = install({ failingTables: ["product_variants"] });
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    expect(captures(fake)).toEqual([]);
    errorSpy.mockRestore();
  });

  it("500s, logged, when the capture write fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    install({
      rpc: {
        capture_abandoned_cart: () => ({ data: null, error: { message: "boom", code: "57014" } }),
      },
    });
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith(
      "[cart/abandoned] capture write failed:",
      expect.objectContaining({ message: "boom" }),
    );
    errorSpy.mockRestore();
  });
});
