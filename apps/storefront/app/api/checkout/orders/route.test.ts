import { describe, it, expect } from "vitest";
import { checkoutOrderBodySchema } from "./route";

describe("checkoutOrderBodySchema", () => {
  const validItem = {
    product_id: "a1b2c3d4-e5f6-4789-ab12-cd34ef567890",
    variant_id: null,
    name: "Test Product",
    variant_name: null,
    price: 5000,
    quantity: 1,
  };

  const validBody = {
    tenant_id: "f1e2d3c4-b5a6-4789-8f12-cd34ef567890",
    customer_name: "Ali Hassan",
    phone: "07701234567",
    governorate_code: "BGH",
    city: "Baghdad",
    address_details: "Street 14, District 5",
    payment_method: "cod",
    items: [validItem],
  };

  it("(a) parses a valid body successfully", () => {
    const result = checkoutOrderBodySchema.safeParse(validBody);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tenant_id).toBe(validBody.tenant_id);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.payment_method).toBe("cod");
    }
  });

  it("(b) fails when items array is empty", () => {
    const body = { ...validBody, items: [] };
    const result = checkoutOrderBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it("(c) fails when tenant_id is missing", () => {
    const { tenant_id: _omit, ...body } = validBody;
    const result = checkoutOrderBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it("(d) fails when item quantity is 0", () => {
    const body = {
      ...validBody,
      items: [{ ...validItem, quantity: 0 }],
    };
    const result = checkoutOrderBodySchema.safeParse(body);
    expect(result.success).toBe(false);
  });
});
