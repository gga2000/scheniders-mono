import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  store: null as { id: string; is_draft_view?: boolean } | null,
  liveStoreAnalytics: vi.fn(),
  send: vi.fn(),
}));

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => void) => fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "vid" }) }) }));
vi.mock("@/lib/rate-limit", () => ({ clientIp: () => "1.2.3.4", consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/route-guards", () => ({ resolveStoreTenant: async () => m.store }));
vi.mock("@/lib/capi-config", () => ({ liveStoreAnalytics: m.liveStoreAnalytics }));
vi.mock("@/lib/capi-context", () => ({ capiRequestContext: async () => ({}) }));
vi.mock("@/lib/capi", () => ({ META_BROWSE_EVENTS: ["ViewContent", "AddToCart", "InitiateCheckout"], sendMetaBrowseCapi: m.send }));

import { POST } from "./route";

const STORE = "5f0c6f5e-8c1a-4a57-9d8e-0d6a3f1b2c3d";
const OTHER = "6f1c3d2e-8b7a-4c55-9d21-3a4b5c6d7e8f";

function beacon(tenantId: string, host = "shop.scheniders.com"): Request {
  return new Request(`https://${host}/api/meta-event`, {
    method: "POST",
    headers: { host, "user-agent": "Mozilla/5.0 (iPhone)", "content-type": "application/json" },
    body: JSON.stringify({
      tenant_id: tenantId,
      event_name: "ViewContent",
      event_id: "evt-12345678",
      value: 1000,
      contents: [{ id: "p1", quantity: 1, item_price: 1000 }],
    }),
  });
}

beforeEach(() => {
  m.store = { id: STORE };
  m.liveStoreAnalytics.mockReset();
  m.liveStoreAnalytics.mockResolvedValue({ meta_pixel_id: "px", meta_capi_token: "tok" });
  m.send.mockReset();
});

describe("POST /api/meta-event", () => {
  it("forwards a beacon for the store whose page sent it", async () => {
    expect((await POST(beacon(STORE))).status).toBe(204);
    expect(m.liveStoreAnalytics).toHaveBeenCalledWith(STORE);
    expect(m.send).toHaveBeenCalledTimes(1);
  });

  it("drops a beacon that names another store than the page's", async () => {
    expect((await POST(beacon(OTHER))).status).toBe(204);
    expect(m.liveStoreAnalytics).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });

  it("drops a beacon from the merchant's draft preview", async () => {
    m.store = { id: STORE, is_draft_view: true };
    await POST(beacon(STORE));
    expect(m.send).not.toHaveBeenCalled();
  });
});
