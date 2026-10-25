import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

const H = vi.hoisted(() => ({
  publishJSON: vi.fn(),
  clientConfigs: [] as Array<Record<string, unknown>>,
  afterCallbacks: [] as Array<() => unknown>,
}));

// `after` defers to "once the response is sent". Captured here so each test
// decides when that moment comes.
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    H.afterCallbacks.push(cb);
  },
}));
vi.mock("@upstash/qstash", () => ({
  Client: class {
    constructor(config: Record<string, unknown>) {
      H.clientConfigs.push(config);
    }
    publishJSON(request: unknown) {
      return H.publishJSON(request);
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceClient: vi.fn() }));

import { queueOrderConfirmation, CONFIRMATION_NOT_QUEUED_REASON } from "./order-confirmation-queue";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT = "0a0b0c0d-1e1f-4a2b-8c3d-4e5f6a7b8c9d";
const ORDER = "11111111-1111-4111-8111-111111111111";
const ENDPOINT = "https://platform.example.com/api/webhooks/storefront-order";

function configure(): void {
  vi.stubEnv("QSTASH_TOKEN", "qstash-token");
  vi.stubEnv("QSTASH_URL", "https://qstash-us-east-1.upstash.io");
  vi.stubEnv("STOREFRONT_ORDER_WEBHOOK_URL", ENDPOINT);
}

function unconfigure(): void {
  vi.stubEnv("QSTASH_TOKEN", "");
  vi.stubEnv("QSTASH_URL", "");
  vi.stubEnv("STOREFRONT_ORDER_WEBHOOK_URL", "");
}

async function respondThenRunAfter(): Promise<void> {
  for (const cb of H.afterCallbacks.splice(0)) await cb();
}

function installOrders(orders: Row[]) {
  const fake = createFakeSupabase({ orders });
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  H.publishJSON.mockReset();
  H.clientConfigs.length = 0;
  H.afterCallbacks.length = 0;
  vi.mocked(createSupabaseServiceClient).mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("queueOrderConfirmation", () => {
  it("queues nothing, and says so with the order id, when the storefront has no queue configured", () => {
    unconfigure();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    queueOrderConfirmation({ id: ORDER, tenantId: TENANT });
    expect(H.afterCallbacks).toHaveLength(0);
    expect(H.publishJSON).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).toContain(ORDER);
    error.mockRestore();
  });

  it("refuses a malformed endpoint URL rather than publishing to it", () => {
    configure();
    vi.stubEnv("STOREFRONT_ORDER_WEBHOOK_URL", "not a url");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    queueOrderConfirmation({ id: ORDER, tenantId: TENANT });
    expect(H.afterCallbacks).toHaveLength(0);
    expect(String(error.mock.calls[0]?.[0])).toContain("STOREFRONT_ORDER_WEBHOOK_URL");
    error.mockRestore();
  });

  it("hands only the order id to QStash, and only after the response", async () => {
    configure();
    H.publishJSON.mockResolvedValue({ messageId: "msg_1" });
    queueOrderConfirmation({ id: ORDER, tenantId: TENANT });

    expect(H.publishJSON).not.toHaveBeenCalled();
    expect(H.afterCallbacks).toHaveLength(1);

    await respondThenRunAfter();

    expect(H.clientConfigs).toEqual([
      { token: "qstash-token", baseUrl: "https://qstash-us-east-1.upstash.io" },
    ]);
    expect(H.publishJSON).toHaveBeenCalledWith({
      url: ENDPOINT,
      body: { order_id: ORDER },
      retries: 3,
      deduplicationId: `storefront-order-confirmation-${ORDER}`,
    });
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("flags the order for staff when QStash refuses it, keeping its other reasons", async () => {
    configure();
    const fake = installOrders([
      { id: ORDER, tenant_id: TENANT, needs_attention: true, attention_reasons: ["address_incomplete"] },
    ]);
    H.publishJSON.mockRejectedValue(new Error("qstash down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    queueOrderConfirmation({ id: ORDER, tenantId: TENANT });
    await respondThenRunAfter();

    expect(fake.tables.orders[0]).toMatchObject({
      needs_attention: true,
      attention_reasons: ["address_incomplete", CONFIRMATION_NOT_QUEUED_REASON],
    });
    expect(String(error.mock.calls[0]?.[0])).toContain(ORDER);
    error.mockRestore();
  });

  it("flags only inside the order's own tenant", async () => {
    configure();
    const fake = installOrders([
      { id: ORDER, tenant_id: OTHER_TENANT, needs_attention: false, attention_reasons: [] },
    ]);
    H.publishJSON.mockRejectedValue(new Error("qstash down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    queueOrderConfirmation({ id: ORDER, tenantId: TENANT });
    await respondThenRunAfter();

    expect(fake.tables.orders[0]).toMatchObject({ needs_attention: false, attention_reasons: [] });
    expect(fake.writes.filter((w) => w.op === "update")).toHaveLength(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("uses a whatsapp_* reason, which the order card shows as «فشل واتساب»", () => {
    expect(CONFIRMATION_NOT_QUEUED_REASON.startsWith("whatsapp_")).toBe(true);
  });
});
