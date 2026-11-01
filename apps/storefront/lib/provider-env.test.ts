// PKG-00 approach 6a: Meta and TikTok CAPI take their host from env so e2e,
// drills and load tests can point them at the provider mock.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startProviderMock, type ProviderMock } from "@scheniders/provider-mock";
import { parseStorefrontProviderBaseUrls } from "./provider-env";
import type { CapiPurchaseInput } from "./capi";

describe("storefront provider base URLs", () => {
  it("defaults to the real hosts", () => {
    expect(parseStorefrontProviderBaseUrls({})).toEqual({
      META_API_BASE_URL: "https://graph.facebook.com",
      TIKTOK_API_BASE_URL: "https://business-api.tiktok.com",
    });
  });

  it("takes an https override", () => {
    expect(parseStorefrontProviderBaseUrls({ META_API_BASE_URL: "https://meta.example.test/" }).META_API_BASE_URL).toBe(
      "https://meta.example.test",
    );
  });

  it("allows http://localhost off Production, NODE_ENV=production included", () => {
    const urls = parseStorefrontProviderBaseUrls({
      NODE_ENV: "production",
      META_API_BASE_URL: "http://localhost:4010",
      TIKTOK_API_BASE_URL: "http://localhost:4010",
    });
    expect(urls).toEqual({ META_API_BASE_URL: "http://localhost:4010", TIKTOK_API_BASE_URL: "http://localhost:4010" });
  });

  it("refuses an override when VERCEL_ENV=production", () => {
    expect(() =>
      parseStorefrontProviderBaseUrls({ VERCEL_ENV: "production", META_API_BASE_URL: "http://localhost:4010" }),
    ).toThrow(/META_API_BASE_URL: must be the real provider host/);
    expect(() =>
      parseStorefrontProviderBaseUrls({ VERCEL_ENV: "production", TIKTOK_API_BASE_URL: "https://evil.example.test" }),
    ).toThrow(/TIKTOK_API_BASE_URL/);
  });
});

describe("sendPurchaseCapi reaches the hosts from env (against the provider mock)", () => {
  let mock: ProviderMock;

  beforeAll(async () => {
    mock = await startProviderMock();
  });

  afterAll(async () => {
    await mock.close();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("posts Meta and TikTok Purchase events to the mock, never leaking the token into the call log", async () => {
    vi.resetModules();
    vi.stubEnv("META_API_BASE_URL", mock.url);
    vi.stubEnv("TIKTOK_API_BASE_URL", mock.url);
    const { sendPurchaseCapi } = await import("./capi");

    const input: CapiPurchaseInput = {
      analytics: {
        meta_pixel_id: "123456789012345",
        meta_capi_token: "meta-secret-token",
        tiktok_pixel_id: "D6K0A2BC77U5VG9U2BRG",
        tiktok_capi_token: "tiktok-secret-token",
      },
      tenantId: "b5c4f2d4-834f-4af4-822d-9b9826a8f45a",
      eventId: "evt-1",
      customer: { phone: "07700000000" },
      value: 25000,
      contents: [{ id: "p1", quantity: 1, item_price: 25000 }],
      eventTime: 1_700_000_000,
    };
    await sendPurchaseCapi(input);

    const calls = mock.calls().map((c) => `${c.provider} ${c.method} ${c.path}`).sort();
    expect(calls).toEqual([
      "meta POST /v21.0/123456789012345/events",
      "tiktok POST /open_api/v1.3/event/track/",
    ]);
    expect(JSON.stringify(mock.calls())).not.toContain("meta-secret-token");
  });
});
