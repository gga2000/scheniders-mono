import { describe, expect, it } from "vitest";
import { tenantOrderBlock } from "./tenant-order-gate";

const live = { status: "trial", is_prospect: false, restrictions: null };

describe("tenantOrderBlock", () => {
  it("lets an active or trial store take orders", () => {
    expect(tenantOrderBlock(live)).toBeNull();
    expect(tenantOrderBlock({ ...live, status: "active" })).toBeNull();
  });

  it("refuses a demo store built for a sales lead", () => {
    expect(tenantOrderBlock({ ...live, is_prospect: true })).toBe("هذا متجر تجريبي ولا يستقبل الطلبات");
  });

  it("refuses an inactive store and a paused one", () => {
    expect(tenantOrderBlock({ ...live, status: "suspended" })).toBe("المتجر غير نشط حالياً");
    const paused = { ...live, status: "limited", restrictions: { blocks: { new_orders: true } } };
    expect(tenantOrderBlock(paused)).toBe("المتجر متوقف مؤقتاً عن استقبال الطلبات");
    const ended = { ...paused, restrictions: { ...paused.restrictions, paused_until: "2020-01-01T00:00:00Z" } };
    expect(tenantOrderBlock(ended)).toBeNull();
  });
});
