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

function svcWithInsert() {
  const inserted: unknown[] = [];
  const svc = { from: () => ({ insert: (rows: unknown[]) => { inserted.push(...rows); return Promise.resolve({ error: null }); } }) };
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
