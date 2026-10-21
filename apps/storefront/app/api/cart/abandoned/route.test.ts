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
import {
  createFakeSupabase,
  type FakeSupabase,
  type FakeSupabaseOptions,
  type Row,
} from "@/lib/testing/fake-supabase";
import type { Tenant } from "@/lib/types";

const TENANT_ID = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT_ID = "9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0";
const PRODUCT_ID = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const OTHER_PRODUCT_ID = "b2c3d4e5-f6a7-4890-bc23-de45f6a7b8c9";
const VARIANT_ID = "c3d4e5f6-a7b8-4901-8d34-ef56a7b8c9d0";
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

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://shop.scheniders.test/api/cart/abandoned", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "shop.scheniders.test",
      "x-forwarded-for": "1.2.3.4",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function install(carts: Row[] = [], options: FakeSupabaseOptions = {}): FakeSupabase {
  const fake = createFakeSupabase(
    {
      products: [
        {
          id: PRODUCT_ID,
          tenant_id: TENANT_ID,
          name: "عطر",
          price: 25000,
          website_price: null,
          status: "active",
          is_visible: true,
          is_archived: false,
          is_supply: false,
        },
        {
          id: OTHER_PRODUCT_ID,
          tenant_id: OTHER_TENANT_ID,
          name: "Other",
          price: 9000,
          website_price: null,
          status: "active",
          is_visible: true,
          is_archived: false,
          is_supply: false,
        },
      ],
      product_variants: [
        { id: VARIANT_ID, product_id: PRODUCT_ID, tenant_id: TENANT_ID, price: 30000, is_enabled: true },
      ],
      abandoned_carts: carts,
    },
    options,
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const line = { product_id: PRODUCT_ID, variant_id: null, quantity: 2 };
const phoneKey = (tenantId: string, phone: string): string =>
  createHash("sha256").update(`${tenantId}:${phone}`).digest("hex").slice(0, 32);
const consentVersion = (text: string): string =>
  `sha256:${createHash("sha256").update(text.normalize("NFC")).digest("hex").slice(0, 16)}`;
const carts = (fake: FakeSupabase): Row[] => fake.tables.abandoned_carts;

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
    expect(carts(fake)).toEqual([]);
  });

  it("files the capture under the store the host names, never the body's tenant_id", async () => {
    const fake = install();
    const res = await POST(
      req({ tenant_id: OTHER_TENANT_ID, phone: "+964 770 123 4567", items: [line] }),
    );
    expect(res.status).toBe(200);
    expect(resolveStoreTenant).toHaveBeenCalledWith("shop");
    expect(carts(fake)).toHaveLength(1);
    expect(carts(fake)[0]).toMatchObject({ tenant_id: TENANT_ID, phone: "07701234567" });
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
    expect(carts(fake)).toEqual([]);
  });

  it("404s for an unknown store or one that is not live", async () => {
    const fake = install();
    vi.mocked(resolveStoreTenant).mockResolvedValueOnce(null);
    expect((await POST(req({ phone: "07701234567", items: [line] }))).status).toBe(404);
    vi.mocked(resolveStoreTenant).mockResolvedValueOnce(tenant({ status: "suspended" } as Partial<Tenant>));
    expect((await POST(req({ phone: "07701234567", items: [line] }))).status).toBe(404);
    expect(carts(fake)).toEqual([]);
  });

  it("captures nothing for the merchant's own draft-view session", async () => {
    const fake = install();
    vi.mocked(resolveStoreTenant).mockResolvedValueOnce(tenant({ is_draft_view: true }));
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect((await res.json()).skipped).toBe("draft");
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(carts(fake)).toEqual([]);
  });

  it("drops a line for another store's product (nothing left → no row)", async () => {
    const fake = install();
    const res = await POST(
      req({ phone: "07701234567", items: [{ product_id: OTHER_PRODUCT_ID, variant_id: null, quantity: 1 }] }),
    );
    expect((await res.json()).skipped).toBe("items");
    expect(carts(fake)).toEqual([]);
  });

  it("prices and names every line from the catalogue, not the client", async () => {
    const fake = install();
    await POST(
      req({
        phone: "07701234567",
        items: [
          { ...line, price: 1, name: "fake" },
          { product_id: PRODUCT_ID, variant_id: VARIANT_ID, quantity: 1 },
        ],
        governorate: "BG",
        locale: "ar",
      }),
    );
    expect(carts(fake)[0]).toMatchObject({
      items: [
        { product_id: PRODUCT_ID, variant_id: null, name: "عطر", quantity: 2, price: 25000 },
        { product_id: PRODUCT_ID, variant_id: VARIANT_ID, name: "عطر", quantity: 1, price: 30000 },
      ],
      subtotal_iqd: 80000,
      governorate: "BG",
      locale: "ar",
    });
  });

  it("accepts the cart checkout_form beacon body unchanged, as a capture without consent", async () => {
    // checkout_form.client.tsx still sends tenant_id, name, price and an
    // empty governorate while none is picked. All of those are ignored or
    // degraded, never trusted, and no consent is recorded.
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
    expect(carts(fake)[0]).toMatchObject({
      tenant_id: TENANT_ID,
      subtotal_iqd: 25000,
      governorate: null,
    });
    expect(carts(fake)[0].consent_at ?? null).toBeNull();
    expect(carts(fake)[0].consent_text_version ?? null).toBeNull();
  });

  it("records consent and the version of the exact line shown", async () => {
    const fake = install();
    await POST(req({ phone: "07701234567", items: [line], consent_text: CONSENT }));
    const row = carts(fake)[0];
    expect(typeof row.consent_at).toBe("string");
    expect(Number.isNaN(Date.parse(String(row.consent_at)))).toBe(false);
    expect(row.consent_text_version).toBe(consentVersion(CONSENT));
  });

  it("a later capture without consent keeps the consent, and the recovery, already recorded", async () => {
    const fake = install([
      {
        id: "c1",
        tenant_id: TENANT_ID,
        phone: "07701234567",
        items: [],
        subtotal_iqd: 0,
        consent_at: "2026-10-21T10:00:00.000Z",
        consent_text_version: "sha256:abc",
        recovered_at: "2026-10-21T11:00:00.000Z",
        reminded_at: null,
      },
    ]);
    await POST(req({ phone: "07701234567", items: [line] }));
    expect(carts(fake)).toHaveLength(1);
    expect(carts(fake)[0]).toMatchObject({
      consent_at: "2026-10-21T10:00:00.000Z",
      consent_text_version: "sha256:abc",
      recovered_at: "2026-10-21T11:00:00.000Z",
      subtotal_iqd: 50000,
    });
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
    expect(carts(fake)).toEqual([]);
  });

  it("500s, logged, when the catalogue cannot be read", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = install([], { failingTables: ["products"] });
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    expect(carts(fake)).toEqual([]);
    errorSpy.mockRestore();
  });
});
