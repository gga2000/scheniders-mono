import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkoutOrderBodySchema } from "./route";

// ---------------------------------------------------------------------------
// Mock next/headers — factory must not reference top-level let/const vars
// ---------------------------------------------------------------------------
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock the storefront supabase server lib — factory uses inline vi.fn()
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock submitCheckout — factory uses inline vi.fn()
// ---------------------------------------------------------------------------
vi.mock("@/app/actions/checkout", () => ({
  submitCheckout: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports AFTER mocks are declared (hoisted above these by Vitest)
// ---------------------------------------------------------------------------
import { POST } from "./route";
import { cookies } from "next/headers";
import { submitCheckout } from "@/app/actions/checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_TENANT_ID = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const VALID_PRODUCT_ID = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/checkout/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  tenant_id: VALID_TENANT_ID,
  customer_name: "Ali Hassan",
  phone: "07701234567",
  governorate_code: "BG",
  city: "Baghdad",
  address_details: "Street 14, District 5",
  payment_method: "cod",
  items: [
    {
      product_id: VALID_PRODUCT_ID,
      variant_id: null,
      name: "Test Product",
      variant_name: null,
      price: 5000,
      quantity: 1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Schema tests (pre-existing, unchanged)
// ---------------------------------------------------------------------------
describe("checkoutOrderBodySchema", () => {
  const validItem = {
    product_id: VALID_PRODUCT_ID,
    variant_id: null,
    name: "Test Product",
    variant_name: null,
    price: 5000,
    quantity: 1,
  };

  const validSchemaBody = {
    tenant_id: VALID_TENANT_ID,
    customer_name: "Ali Hassan",
    phone: "07701234567",
    governorate_code: "BG",
    city: "Baghdad",
    address_details: "Street 14, District 5",
    payment_method: "cod",
    items: [validItem],
  };

  it("(a) parses a valid body successfully", () => {
    const result = checkoutOrderBodySchema.safeParse(validSchemaBody);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tenant_id).toBe(validSchemaBody.tenant_id);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.payment_method).toBe("cod");
    }
  });

  it("(b) fails when items array is empty", () => {
    const body = { ...validSchemaBody, items: [] };
    const result = checkoutOrderBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it("(c) fails when tenant_id is missing", () => {
    const { tenant_id: _omit, ...body } = validSchemaBody;
    const result = checkoutOrderBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it("(d) fails when item quantity is 0", () => {
    const body = {
      ...validSchemaBody,
      items: [{ ...validItem, quantity: 0 }],
    };
    const result = checkoutOrderBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it("(e) accepts ab_test_arms as an optional record", () => {
    const body = {
      ...validSchemaBody,
      ab_test_arms: { exp1: "arm_a", exp2: "arm_b" },
    };
    const result = checkoutOrderBodySchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ab_test_arms).toEqual({ exp1: "arm_a", exp2: "arm_b" });
    }
  });

  it("(f) accepts body without ab_test_arms", () => {
    const result = checkoutOrderBodySchema.safeParse(validSchemaBody);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ab_test_arms).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// POST handler integration tests
// ---------------------------------------------------------------------------
describe("POST /api/checkout/orders", () => {
  const mockInsert = vi.fn();
  const mockSingle = vi.fn();
  const mockFrom = vi.fn();

  // A running experiment with a single 100%-traffic arm → assignAbArm returns
  // "arm_real" for any visitor, so the SERVER-re-derived attribution (EC19) is
  // deterministic in tests.
  const RUNNING_EXP = {
    id: "exp_real",
    status: "running",
    arms: [{ id: "arm_real", traffic_pct: 100 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: successful order with total
    vi.mocked(submitCheckout).mockResolvedValue({
      success: true,
      orderId: "order-123",
      orderNumber: "ORD-001",
      total: 5000,
    });

    // Default: no sb_vid cookie
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as never);

    // Default: insert succeeds; tenants.select(...).eq(...).single() returns a
    // store config carrying one running experiment.
    mockInsert.mockResolvedValue({ error: null });
    mockSingle.mockResolvedValue({
      data: { store_config_v2: { experiments: [RUNNING_EXP] } },
      error: null,
    });
    mockFrom.mockImplementation((table: string) =>
      table === "tenants"
        ? { select: () => ({ eq: () => ({ single: mockSingle }) }) }
        : { insert: mockInsert },
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: mockFrom,
    } as never);
  });

  it("(g) returns 200 on a successful order (no ab_test_arms)", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("(h) returns 422 when submitCheckout fails", async () => {
    vi.mocked(submitCheckout).mockResolvedValue({
      success: false,
      error: "بعض المنتجات غير متوفرة",
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("(i) returns 400 for an invalid body", async () => {
    const res = await POST(makeRequest({ tenant_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("(j) records a re-derived experiment event when a visitor cookie is present", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);

    expect(mockFrom).toHaveBeenCalledWith("store_config_experiment_events");
    // Attribution is derived server-side from the store config + visitor key.
    expect(mockInsert).toHaveBeenCalledWith([
      {
        tenant_id: VALID_TENANT_ID,
        experiment_id: "exp_real",
        arm_id: "arm_real",
        visitor_key: "visitor-abc",
        event_type: "order",
        revenue_iqd: 5000,
      },
    ]);
  });

  it("(k2) forwards idempotency_key to submitCheckout (EC17)", async () => {
    const res = await POST(
      makeRequest({ ...validBody, idempotency_key: "ec17-key-abcdef12" }),
    );
    expect(res.status).toBe(200);
    expect(submitCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "ec17-key-abcdef12" }),
    );
  });

  it("(k3) rejects a too-short idempotency_key (400)", async () => {
    const res = await POST(makeRequest({ ...validBody, idempotency_key: "short" }));
    expect(res.status).toBe(400);
  });

  it("(k4) normalises alt_phone to 07XXXXXXXXX and forwards it (P2-10)", async () => {
    const res = await POST(
      makeRequest({ ...validBody, alt_phone: "+964 780 123 4567" }),
    );
    expect(res.status).toBe(200);
    expect(submitCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({ alt_phone: "07801234567" }),
      }),
    );
  });

  it("(k5) forwards alt_phone: null when the body has none", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(submitCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({ alt_phone: null }),
      }),
    );
  });

  it("(k6) rejects an undialable alt_phone with 422 and never submits", async () => {
    const res = await POST(makeRequest({ ...validBody, alt_phone: "0000000000" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(submitCheckout).not.toHaveBeenCalled();
  });

  it("(k) does NOT record events when sb_vid cookie is absent", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as never);

    const bodyWithArms = {
      ...validBody,
      ab_test_arms: { exp1: "arm_a" },
    };
    const res = await POST(makeRequest(bodyWithArms));
    expect(res.status).toBe(200);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("(l) ignores client-supplied ab_test_arms — attribution is re-derived (EC19)", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);

    // Attacker tries to credit a forged arm + a non-existent experiment.
    const forged = {
      ...validBody,
      ab_test_arms: { exp_real: "forged_arm", ghost_exp: "ghost_arm" },
    };
    const res = await POST(makeRequest(forged));
    expect(res.status).toBe(200);

    // Only the store's real experiment + its re-derived arm are recorded.
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        experiment_id: "exp_real",
        arm_id: "arm_real",
      }),
    ]);
    const inserted = JSON.stringify(mockInsert.mock.calls);
    expect(inserted).not.toContain("forged_arm");
    expect(inserted).not.toContain("ghost_exp");
  });

  it("(l2) records only the first-party purchase when the store has no running experiments", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);
    mockSingle.mockResolvedValue({
      data: { store_config_v2: { experiments: [] } },
      error: null,
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    // One insert: the funnel's purchase rows (one per line, server total on
    // the first) — and no experiment attribution rows at all.
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const rows = mockInsert.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(rows.every((r) => r.event_type === "purchase" && r.visitor_key === "visitor-abc")).toBe(true);
    expect(rows.some((r) => "experiment_id" in r)).toBe(false);
    expect(rows[0]?.value_iqd).toBeTypeOf("number");
  });

  it("(l3) does not count a replayed submit's purchase twice", async () => {
    // EC17: a retry with the same idempotency key answers the order already
    // placed, whose purchase rows the first response wrote.
    vi.mocked(submitCheckout).mockResolvedValue({
      success: true,
      orderId: "order-123",
      orderNumber: "ORD-001",
      total: 5000,
      replayed: true,
    });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);
    mockSingle.mockResolvedValue({
      data: { store_config_v2: { experiments: [] } },
      error: null,
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("(m) does NOT record events on a failed order", async () => {
    vi.mocked(submitCheckout).mockResolvedValue({
      success: false,
      error: "فشل إنشاء الطلب. حاول مرة أخرى.",
    });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);

    const bodyWithArms = { ...validBody, ab_test_arms: { exp1: "arm_a" } };
    const res = await POST(makeRequest(bodyWithArms));
    expect(res.status).toBe(422);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("(n) CRITICAL: event-write failure (DB error) does NOT change the 200 success response", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);
    // DB insert returns an error (not a throw)
    mockInsert.mockResolvedValue({ error: new Error("DB unavailable") });

    const bodyWithArms = { ...validBody, ab_test_arms: { exp1: "arm_a" } };
    const res = await POST(makeRequest(bodyWithArms));
    // The order still succeeds — event write failure is logged, not swallowed into the response
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.orderId).toBe("order-123");
  });

  it("(o) CRITICAL: event-write throwing does NOT change the 200 success response", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);
    // Simulate the entire service client init throwing
    vi.mocked(createSupabaseServiceClient).mockImplementationOnce(() => {
      throw new Error("Service client init failed");
    });

    const bodyWithArms = { ...validBody, ab_test_arms: { exp1: "arm_a" } };
    const res = await POST(makeRequest(bodyWithArms));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
