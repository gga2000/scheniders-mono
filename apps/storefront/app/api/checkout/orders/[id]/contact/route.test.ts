import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  type FakeSupabaseOptions,
  type Row,
} from "@/lib/testing/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { GET } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { signUpsellProof, UPSELL_WINDOW_MS } from "@/lib/order-upsell-proof";

// =====================================================================
// The thank-you call card reads and writes the phone numbers on an order
// a courier will call. These tests are about who may see them (only the
// browser holding the checkout's proof, only masked) and when a second
// number may still be added.
// =====================================================================

const SECRET = "test-service-role-key-for-hmac-derivation";
const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT = "0e0e0e0e-b5a6-4789-8f12-cd34ef567890";
const ORDER = "11111111-1111-4111-8111-111111111111";
const OTHER_ORDER = "22222222-2222-4222-8222-222222222222";

function order(over: Row = {}): Row {
  return {
    id: ORDER,
    tenant_id: TENANT,
    phone: "07701234567",
    secondary_phone: null,
    status: "new",
    created_at: new Date().toISOString(),
    version: 3,
    deleted_at: null,
    ...over,
  };
}

function sentLog(over: Row = {}): Row {
  return {
    id: "log-1",
    order_uuid: ORDER,
    tenant_id: TENANT,
    direction: "outbound",
    template_name: "cod_order_confirm",
    status: "sent",
    ...over,
  };
}

function install(
  t: { orders?: Row[]; whatsapp_logs?: Row[] } = {},
  options: FakeSupabaseOptions = {},
) {
  const fake = createFakeSupabase(
    { orders: t.orders ?? [order()], whatsapp_logs: t.whatsapp_logs ?? [] },
    options,
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const proofFor = (orderId = ORDER, tenantId = TENANT, nowMs = Date.now()) =>
  signUpsellProof({ tenantId, orderId }, SECRET, nowMs);

const ctx = (id = ORDER) => ({ params: Promise.resolve({ id }) });
const getReq = (proof: string | null, id = ORDER) =>
  new Request(`http://x/api/checkout/orders/${id}/contact`, {
    headers: proof ? { "x-upsell-proof": proof } : {},
  });

const stale = () => new Date(Date.now() - UPSELL_WINDOW_MS - 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SECRET);
});

describe("GET — who may read an order's contact state", () => {
  it.each([
    ["no proof", null],
    ["a forged proof", "v1.e30.AAAA"],
    ["a proof for a different order", proofFor(OTHER_ORDER)],
    ["a proof signed with another key", signUpsellProof({ tenantId: TENANT, orderId: ORDER }, "other-key")],
    ["an expired proof", proofFor(ORDER, TENANT, Date.now() - UPSELL_WINDOW_MS - 1000)],
  ])("is the same 404 with %s", async (_label, proof) => {
    install();
    expect((await GET(getReq(proof), ctx())).status).toBe(404);
  });

  it("takes the tenant from the proof, so a proof for another store finds nothing", async () => {
    install();
    expect((await GET(getReq(proofFor(ORDER, OTHER_TENANT)), ctx())).status).toBe(404);
  });

  it("is 404 for a malformed order id", async () => {
    install();
    expect((await GET(getReq(proofFor()), ctx("not-a-uuid"))).status).toBe(404);
  });

  it("is 404 for a deleted order", async () => {
    install({ orders: [order({ deleted_at: new Date().toISOString() })] });
    expect((await GET(getReq(proofFor()), ctx())).status).toBe(404);
  });

  it("is off entirely when the server has no key to verify with", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    install();
    expect((await GET(getReq(proofFor()), ctx())).status).toBe(404);
  });
});

describe("GET — what it reports", () => {
  it("masks the buyer's phone and says a second number can still be added", async () => {
    install();
    const res = await GET(getReq(proofFor()), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      phone_masked: "0770 ••• 4567",
      has_backup: false,
      can_add_backup: true,
      whatsapp_sent: false,
    });
  });

  it("never returns the full phone", async () => {
    install();
    const text = await (await GET(getReq(proofFor()), ctx())).text();
    expect(text).not.toContain("07701234567");
    expect(text).not.toContain("1234567");
  });

  it("reports the WhatsApp confirmation once the platform logged it as sent", async () => {
    install({ whatsapp_logs: [sentLog()] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.whatsapp_sent).toBe(true);
  });

  it.each([
    ["a failed send", sentLog({ status: "failed" })],
    ["a reminder, not the confirmation", sentLog({ template_name: "order_reminder" })],
    ["an inbound reply", sentLog({ direction: "inbound", status: "received" })],
    ["another order's send", sentLog({ order_uuid: OTHER_ORDER })],
    ["another tenant's row", sentLog({ tenant_id: OTHER_TENANT })],
  ])("does not count %s as sent", async (_label, log) => {
    install({ whatsapp_logs: [log] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.whatsapp_sent).toBe(false);
  });

  it("treats an empty stored backup as none", async () => {
    install({ orders: [order({ secondary_phone: "  " })] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.has_backup).toBe(false);
    expect(body.can_add_backup).toBe(true);
  });

  it.each([
    ["it already has a backup", { secondary_phone: "07801112222" }, true],
    ["ops confirmed it", { status: "confirmed" }, false],
    ["it was cancelled", { status: "cancelled" }, false],
    ["it is older than the window", { created_at: stale() }, false],
  ])("cannot take a second number when %s", async (_label, over, hasBackup) => {
    install({ orders: [order(over)] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.can_add_backup).toBe(false);
    expect(body.has_backup).toBe(hasBackup);
  });

  it("still takes a second number once the WhatsApp bot moved it to contacted", async () => {
    install({ orders: [order({ status: "contacted" })] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.can_add_backup).toBe(true);
  });

  it("returns no mask for a number that is not an Iraqi mobile", async () => {
    install({ orders: [order({ phone: "+1 555 0100" })] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.phone_masked).toBeNull();
  });

  it("is 503, not a guess, when the order cannot be read", async () => {
    install({}, { failingTables: ["orders"] });
    expect((await GET(getReq(proofFor()), ctx())).status).toBe(503);
  });

  it("is 503, not a guess, when the send log cannot be read", async () => {
    install({}, { failingTables: ["whatsapp_logs"] });
    expect((await GET(getReq(proofFor()), ctx())).status).toBe(503);
  });
});
