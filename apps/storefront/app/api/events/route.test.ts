import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { POST } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

// The limiter windows, the live-tenant check and the insert all run inside
// record_storefront_beacon (packages/supabase/migrations/
// 20261102061235_record_storefront_beacon.sql). These tests pin what the
// route hands it and what it does before and after.

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PRODUCT = "11111111-1111-4111-8111-111111111111";
const VISITOR = "22222222-2222-4222-8222-222222222222";

const req = (body: unknown, ip: string | null = "203.0.113.7") => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
  };
  if (ip) headers["x-forwarded-for"] = ip;
  return new Request("http://x/api/events", { method: "POST", headers, body: JSON.stringify(body) });
};

function visitorCookie(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({ get: () => (value === undefined ? undefined : { value }) } as never);
}

function svcWithRpc(error: unknown = null) {
  const rpc = vi.fn(() => Promise.resolve({ data: error ? null : "recorded", error }));
  vi.mocked(createSupabaseServiceClient).mockReturnValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/events", () => {
  it("drops beacons from crawlers", async () => {
    visitorCookie(VISITOR);
    const rpc = svcWithRpc();
    const bot = new Request("http://x/api/events", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Googlebot/2.1" },
      body: JSON.stringify({ tenant_id: TENANT, events: [{ type: "page_view" }] }),
    });
    expect((await POST(bot)).status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records the batch in one call, under the cookie's visitor key and both windows", async () => {
    visitorCookie(VISITOR);
    const rpc = svcWithRpc();
    const events = [
      { type: "page_view", page_id: "home" },
      { type: "view_product", page_id: "product", product_id: PRODUCT },
    ];
    const res = await POST(req({ tenant_id: TENANT, events }));
    expect(res.status).toBe(204);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_storefront_beacon", {
      _tenant_id: TENANT,
      _visitor_key: VISITOR,
      _visitor_key_limit_key: `events:visitor:${TENANT}:${VISITOR}`,
      _visitor_limit: 120,
      _ip_limit: 600,
      _window_seconds: 60,
      _events: events,
      _ip_key: "events:ip:203.0.113.7",
    });
  });

  it("skips the address window when the address is unknown", async () => {
    visitorCookie(VISITOR);
    const rpc = svcWithRpc();
    await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }, null));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]).not.toHaveProperty([1, "_ip_key"]);
  });

  it("drops the beacon without a proxy-minted visitor cookie, rejects purchase and garbage", async () => {
    const rpc = svcWithRpc();
    visitorCookie(undefined);
    expect((await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }))).status).toBe(204);
    visitorCookie("not-a-uuid");
    expect((await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }))).status).toBe(204);

    visitorCookie(VISITOR);
    expect((await POST(req({ tenant_id: TENANT, events: [{ type: "purchase" }] }))).status).toBe(400);
    expect((await POST(req({ tenant_id: "nope", events: [] }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 204 and logs when the database call fails", async () => {
    visitorCookie(VISITOR);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    svcWithRpc({ message: "statement timeout" });
    const res = await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }));
    expect(res.status).toBe(204);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
