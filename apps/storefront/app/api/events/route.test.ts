import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { POST } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PRODUCT = "11111111-1111-4111-8111-111111111111";
const req = (body: unknown) =>
  new Request("http://x/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/**
 * @param tenantRow what the tenant lookup finds — `null` means "no servable
 *   store with that id", which is the case the route now has to refuse.
 * @param allowed what the rate limiter decides.
 */
function svcWithInsert(
  tenantRow: unknown = { id: TENANT },
  allowed = true,
) {
  const inserted: unknown[] = [];
  const svc = {
    from: (table: string) => {
      if (table === "tenants") {
        const c: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in"]) c[m] = () => c;
        c.maybeSingle = () => Promise.resolve({ data: tenantRow, error: null });
        return c;
      }
      return {
        insert: (rows: unknown[]) => {
          inserted.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    },
    rpc: () => {
      const result = {
        data: { allowed, remaining: allowed ? 119 : 0, reset_at: new Date(Date.now() + 60000).toISOString() },
        error: null,
      };
      const p = Promise.resolve(result) as Promise<typeof result> & {
        single: () => Promise<typeof result>;
      };
      p.single = () => Promise.resolve(result);
      return p;
    },
  };
  vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never);
  return inserted;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/events", () => {
  it("writes the batch under the cookie's visitor key, never a client one", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: "vid-1" }) } as never);
    const inserted = svcWithInsert();
    const res = await POST(req({ tenant_id: TENANT, events: [{ type: "page_view", page_id: "home" }, { type: "view_product", page_id: "product", product_id: PRODUCT }] }));
    expect(res.status).toBe(204);
    expect(inserted).toEqual([
      { tenant_id: TENANT, visitor_key: "vid-1", event_type: "page_view", page_id: "home", product_id: null },
      { tenant_id: TENANT, visitor_key: "vid-1", event_type: "view_product", page_id: "product", product_id: PRODUCT },
    ]);
  });

  it("drops the beacon without a visitor cookie, rejects purchase and garbage", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
    const inserted = svcWithInsert();
    expect((await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }))).status).toBe(204);
    expect(inserted).toHaveLength(0);
    expect((await POST(req({ tenant_id: TENANT, events: [{ type: "purchase" }] }))).status).toBe(400);
    expect((await POST(req({ tenant_id: "nope", events: [] }))).status).toBe(400);
  });
});

describe("POST /api/events — it writes with the service role, so it checks first", () => {
  it("refuses a tenant id that is not a servable store", async () => {
    // `tenant_id` comes from the client. Inserted verbatim, it let anyone
    // attribute events to any uuid at all: junk rows for stores that do not
    // exist, and noise in a real merchant's funnel.
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: "vid-1" }) } as never);
    const inserted = svcWithInsert(null);
    const res = await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }));
    expect(res.status).toBe(204);
    expect(inserted).toHaveLength(0);
  });

  it("stops writing once the visitor's window is spent", async () => {
    // Twenty rows a request with no limit and no auth meant the table grew as
    // fast as anyone cared to push. A beacon never reports failure to the
    // page, so an exhausted window is a silent 204 like every other outcome.
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: "vid-1" }) } as never);
    const inserted = svcWithInsert({ id: TENANT }, false);
    const res = await POST(req({ tenant_id: TENANT, events: [{ type: "page_view" }] }));
    expect(res.status).toBe(204);
    expect(inserted).toHaveLength(0);
  });
});
