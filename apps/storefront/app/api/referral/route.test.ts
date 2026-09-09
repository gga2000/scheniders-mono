import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { POST as mint } from "./code/route";
import { GET as validate } from "./validate/route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const ORDER = "11111111-1111-4111-8111-111111111111";

/** Query-builder stub: `.from(table)` resolves to rows[table]; `.rpc(name)` to rpcs[name]. */
function makeSvc(rows: Record<string, unknown>, rpcs: Record<string, unknown> = {}) {
  const rpcCalls: { name: string; args: unknown }[] = [];
  const chain = (table: string) => {
    const result = { data: rows[table] ?? null, error: null };
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "insert"]) c[m] = () => c;
    c.maybeSingle = () => Promise.resolve(result);
    c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return c;
  };
  return {
    from: chain,
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: rpcs[name] ?? null, error: null });
    },
    rpcCalls,
  };
}

const program = { commerce: { referral: { enabled: true, friend_discount_pct: 10, friend_max_discount_iqd: 5000, referrer_points: 50 }, loyalty: { enabled: true } } };
const tenantOn = { store_config_v2: program };
const tenantOff = { store_config_v2: { commerce: {} } };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/referral/code", () => {
  const req = (body: unknown) =>
    new Request("http://x/api/referral/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("mints for the buyer who can prove the order", async () => {
    const svc = makeSvc({ tenants: tenantOn, orders: { id: ORDER, phone: "9647701234567", deleted_at: null } }, { mint_referral_code: "AB3K7M" });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never);
    const res = await mint(req({ tenant_id: TENANT, order_id: ORDER, phone: "07701234567" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: "AB3K7M" });
    expect(svc.rpcCalls[0]).toEqual({ name: "mint_referral_code", args: { _tenant_id: TENANT, _phone: "07701234567" } });
  });

  it("is 404 for the wrong phone, a deleted order, or a store with referrals off", async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ tenants: tenantOn, orders: { id: ORDER, phone: "9647709999999", deleted_at: null } }, { mint_referral_code: "X" }) as never,
    );
    expect((await mint(req({ tenant_id: TENANT, order_id: ORDER, phone: "07701234567" }))).status).toBe(404);
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ tenants: tenantOn, orders: { id: ORDER, phone: "9647701234567", deleted_at: "2026-01-01" } }) as never,
    );
    expect((await mint(req({ tenant_id: TENANT, order_id: ORDER, phone: "07701234567" }))).status).toBe(404);
    const off = makeSvc({ tenants: tenantOff, orders: { id: ORDER, phone: "9647701234567", deleted_at: null } }, { mint_referral_code: "X" });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(off as never);
    expect((await mint(req({ tenant_id: TENANT, order_id: ORDER, phone: "07701234567" }))).status).toBe(404);
    expect(off.rpcCalls).toHaveLength(0);
  });
});

describe("GET /api/referral/validate", () => {
  const req = (q: Record<string, string>) => new Request(`http://x/api/referral/validate?${new URLSearchParams(q)}`);

  it("returns the friend's terms for an eligible code", async () => {
    const svc = makeSvc({ tenants: tenantOn }, { referral_check: [{ ok: true, reason: "ok", referrer_phone: "07701111111" }] });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never);
    const res = await validate(req({ tenant_id: TENANT, code: "ab3k 7m", phone: "07702222222" }));
    expect(await res.json()).toEqual({ valid: true, friend_discount_pct: 10, friend_max_discount_iqd: 5000 });
    expect(svc.rpcCalls[0]).toEqual({ name: "referral_check", args: { _tenant_id: TENANT, _code: "AB3K7M", _phone: "07702222222" } });
  });

  it("never leaks the referrer, and names the reason the buyer can act on", async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ tenants: tenantOn }, { referral_check: [{ ok: false, reason: "self", referrer_phone: "07701111111" }] }) as never,
    );
    const body = await (await validate(req({ tenant_id: TENANT, code: "AB3K7M", phone: "07701111111" }))).json();
    expect(body).toEqual({ valid: false, reason: "self" });
    expect(JSON.stringify(body)).not.toContain("0770111");
  });

  it("is 'off' when the program is off, 'unknown' for a malformed code", async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeSvc({ tenants: tenantOff }) as never);
    expect(await (await validate(req({ tenant_id: TENANT, code: "AB3K7M" }))).json()).toEqual({ valid: false, reason: "off" });
    expect(await (await validate(req({ tenant_id: TENANT, code: "0O1I" }))).json()).toEqual({ valid: false, reason: "unknown" });
  });
});
