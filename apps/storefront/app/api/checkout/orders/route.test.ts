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
  governorate_code: "BGH",
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
    governorate_code: "BGH",
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
  const mockFrom = vi.fn();

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

    // Default: insert succeeds
    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });
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

  it("(j) records experiment events when visitor cookie and arms are present", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);

    const bodyWithArms = {
      ...validBody,
      ab_test_arms: { exp1: "arm_a" },
    };
    const res = await POST(makeRequest(bodyWithArms));
    expect(res.status).toBe(200);

    expect(mockFrom).toHaveBeenCalledWith("store_config_experiment_events");
    expect(mockInsert).toHaveBeenCalledWith([
      {
        tenant_id: VALID_TENANT_ID,
        experiment_id: "exp1",
        arm_id: "arm_a",
        visitor_key: "visitor-abc",
        event_type: "order",
        revenue_iqd: 5000,
      },
    ]);
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

  it("(l) does NOT record events when ab_test_arms is empty", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);

    const bodyWithEmptyArms = { ...validBody, ab_test_arms: {} };
    const res = await POST(makeRequest(bodyWithEmptyArms));
    expect(res.status).toBe(200);
    expect(mockFrom).not.toHaveBeenCalled();
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
