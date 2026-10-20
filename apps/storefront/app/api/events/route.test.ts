import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RateLimitResult } from "@/lib/rate-limit";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, consumeRateLimit: vi.fn() };
});

import { POST } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { cookies } from "next/headers";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PRODUCT = "11111111-1111-4111-8111-111111111111";
const VISITOR = "22222222-2222-4222-8222-222222222222";

const req = (body: unknown, ip = "203.0.113.7") =>
  new Request("http://x/api/events", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

const ALLOW: RateLimitResult = { allowed: true, remaining: 100, retryAfterSeconds: 0 };
const DENY: RateLimitResult = { allowed: false, remaining: 0, retryAfterSeconds: 30 };

function visitorCookie(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({ get: () => (value === undefined ? undefined : { value }) } as never);
}

/**
 * @param tenantRow what the tenant lookup finds — `null` means "no live store
 *   with that id", which the route has to refuse.
 */
function svcWithInsert(tenantRow: unknown = { id: TENANT }, tenantError: unknown = null) {
  const inserted: unknown[] = [];
  const tenantFilters: Array<[string, unknown]> = [];
  const svc = {
    from: (table: string) => {
      if (table === "tenants") {
        const chain = {
          select: () => chain,
          eq: (col: string, v: unknown) => {
            tenantFilters.push([col, v]);
            return chain;
          },
          in: (col: string, v: unknown) => {
            tenantFilters.push([col, v]);
            return chain;
          },
          maybeSingle: () => Promise.resolve({ data: tenantRow, error: tenantError }),
        };
        return chain;
      }
      return {
        insert: (rows: unknown[]) => {
          inserted.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never);
  return { inserted, tenantFilters };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumeRateLimit).mockResolvedValue(ALLOW);
});

describe("POST /api/events", () => {
  it("writes the batch under the cookie's visitor key, never a client one", async () => {
    visitorCookie(VISITOR);
    const { inserted, tenantFilters } = svcWithInsert();
    const res = await POST(
      req({
        tenant_id: TENANT,
        events: [
          { type: "page_view", page_id: "home" },
          { type: "view_product", page_id: "product", product_id: PRODUCT },
        ],
      }),
    );
    expect(res.status).toBe(204);
    expect(inserted).toEqual([
      { tenant_id: TENANT, visitor_key: VISITOR, event_type: "page_view", page_id: "home", product_id: null },
      { tenant_id: TENANT, visitor_key: VISITOR, event_type: "view_product", page_id: "product", product_id: PRODUCT },
    ]);
    expect(tenantFilters).toEqual([
      ["id", TENANT],
      ["status", ["active", "trial"]],
    ]);
  });

  it("drops the beacon without a proxy-minted visitor cookie, rejects purchase and garbage", async () => {
    const { inserted } = svcWithInsert();
    visitorCookie(undefined);
    expect((await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }))).status).toBe(204);
    visitorCookie("not-a-uuid");
    expect((await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }))).status).toBe(204);
    expect(inserted).toHaveLength(0);
    expect(consumeRateLimit).not.toHaveBeenCalled();

    visitorCookie(VISITOR);
    expect((await POST(req({ tenant_id: TENANT, events: [{ type: "purchase" }] }))).status).toBe(400);
    expect((await POST(req({ tenant_id: "nope", events: [] }))).status).toBe(400);
    expect(inserted).toHaveLength(0);
  });
});

describe("POST /api/events — it writes with the service role, so it checks first", () => {
  it("refuses a tenant id that is not a live store", async () => {
    visitorCookie(VISITOR);
    const { inserted } = svcWithInsert(null);
    const res = await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }));
    expect(res.status).toBe(204);
    expect(inserted).toHaveLength(0);
  });

  it("writes nothing when the tenant lookup fails", async () => {
    visitorCookie(VISITOR);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { inserted } = svcWithInsert(null, { message: "tenants unavailable" });
    const res = await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }));
    expect(res.status).toBe(204);
    expect(inserted).toHaveLength(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("limits per address and per visitor, failing open", async () => {
    visitorCookie(VISITOR);
    svcWithInsert();
    await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }));
    const calls = vi.mocked(consumeRateLimit).mock.calls;
    expect(calls).toEqual([
      ["events:ip:203.0.113.7", 600, 60, "fail-open"],
      [`events:visitor:${TENANT}:${VISITOR}`, 120, 60, "fail-open"],
    ]);
  });

  it("stops writing once the visitor's window is spent", async () => {
    visitorCookie(VISITOR);
    const { inserted } = svcWithInsert();
    vi.mocked(consumeRateLimit).mockImplementation(async (key) => (key.startsWith("events:visitor:") ? DENY : ALLOW));
    const res = await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }));
    expect(res.status).toBe(204);
    expect(inserted).toHaveLength(0);
  });

  it("stops writing once the address's window is spent, whatever cookie it sends", async () => {
    // A script can mint a fresh sb_vid per request; the address window is
    // what bounds it.
    visitorCookie(VISITOR);
    const { inserted } = svcWithInsert();
    vi.mocked(consumeRateLimit).mockImplementation(async (key) => (key.startsWith("events:ip:") ? DENY : ALLOW));
    const res = await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }));
    expect(res.status).toBe(204);
    expect(inserted).toHaveLength(0);
  });
});
