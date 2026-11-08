import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { GET } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT = "0e0e0e0e-b5a6-4789-8f12-cd34ef567890";

type RpcHandler = (args: Row) => { data: unknown; error: { message: string } | null };
const allowed: RpcHandler = () => ({
  data: [{ allowed: true, remaining: 5, reset_at: new Date(Date.now() + 60_000).toISOString() }],
  error: null,
});
const refused: RpcHandler = () => ({
  data: [{ allowed: false, remaining: 0, reset_at: new Date(Date.now() + 60_000).toISOString() }],
  error: null,
});

function install(rate: RpcHandler = allowed) {
  const fake = createFakeSupabase(
    {
      tenants: [
        {
          id: TENANT,
          store_config_v2: {
            commerce: {
              discounts: [
                { code: "VIP40", kind: "percent", value: 40, enabled: true },
                { code: "OLD", kind: "fixed", value: 5000, enabled: true, ends_iso: "2020-01-01T00:00:00Z" },
                { code: "OFF", kind: "fixed", value: 5000, enabled: false },
              ],
            },
          },
        },
        { id: OTHER_TENANT, store_config_v2: { commerce: { discounts: [{ code: "THEIRS", kind: "percent", value: 90, enabled: true }] } } },
      ],
    },
    { rpc: { consume_rate_limit: rate } },
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
}

const get = (q: Record<string, string>) =>
  GET(new Request(`http://x/api/coupon/validate?${new URLSearchParams(q).toString()}`));

beforeEach(() => vi.clearAllMocks());

describe("GET /api/coupon/validate", () => {
  it("returns only the typed code's definition, case-insensitive", async () => {
    install();
    const body = await (await get({ tenant_id: TENANT, code: "vip40" })).json();
    expect(body).toEqual({ valid: true, discount: { code: "VIP40", kind: "percent", value: 40, enabled: true } });
    expect(JSON.stringify(body)).not.toContain("OLD");
  });

  it("answers the same for unknown, expired, disabled and another store's code", async () => {
    install();
    for (const code of ["NOPE", "OLD", "OFF", "THEIRS"]) {
      expect(await (await get({ tenant_id: TENANT, code })).json()).toEqual({ valid: false });
    }
  });

  it("refuses guessing past the per-caller limit", async () => {
    install(refused);
    expect((await get({ tenant_id: TENANT, code: "VIP40" })).status).toBe(429);
  });

  it("400s on a bad query", async () => {
    install();
    expect((await get({ tenant_id: "x", code: "VIP40" })).status).toBe(400);
  });
});
