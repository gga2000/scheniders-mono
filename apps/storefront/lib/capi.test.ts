import { describe, it, expect } from "vitest";
import {
  buildMetaPurchaseEvent,
  buildTikTokPurchaseEvent,
  type CapiPurchaseInput,
} from "./capi";

const base: CapiPurchaseInput = {
  analytics: {
    meta_pixel_id: "123456789012345",
    meta_capi_token: "tok",
    tiktok_pixel_id: "TT123",
    tiktok_capi_token: "tok2",
  },
  eventId: "evt-123",
  customer: { phone: "07700000000", name: "Ali", email: "A@B.com" },
  value: 13000,
  contents: [
    { id: "a", quantity: 2, item_price: 5000 },
    { id: "b", quantity: 1, item_price: 3000 },
  ],
  eventTime: 1_700_000_000,
};

const HEX64 = /^[a-f0-9]{64}$/;

describe("buildMetaPurchaseEvent", () => {
  it("hashes PII + keeps event_id/value/contents", () => {
    const ev = buildMetaPurchaseEvent(base).data[0];
    expect(ev.event_name).toBe("Purchase");
    expect(ev.event_id).toBe("evt-123");
    const ud = ev.user_data as Record<string, string[]>;
    expect(ud.ph[0]).toMatch(HEX64);
    expect(ud.ph[0]).not.toContain("770"); // raw phone never leaks
    expect(ud.em[0]).toMatch(HEX64);
    expect(ud.fn[0]).toMatch(HEX64);
    const cd = ev.custom_data as Record<string, unknown>;
    expect(cd.value).toBe(13000);
    expect(cd.currency).toBe("IQD");
    expect(cd.content_ids).toEqual(["a", "b"]);
    expect(cd.num_items).toBe(3);
  });

  it("includes test_event_code when configured", () => {
    const e = buildMetaPurchaseEvent({
      ...base,
      analytics: { ...base.analytics, capi_test_event_code: "TEST1" },
    });
    expect(e.test_event_code).toBe("TEST1");
  });

  it("is deterministic for the same phone", () => {
    const a = (buildMetaPurchaseEvent(base).data[0].user_data as Record<string, string[]>).ph[0];
    const b = (buildMetaPurchaseEvent(base).data[0].user_data as Record<string, string[]>).ph[0];
    expect(a).toBe(b);
  });
});

describe("buildTikTokPurchaseEvent", () => {
  it("hashes phone + maps Purchase → CompletePayment", () => {
    const e = buildTikTokPurchaseEvent(base);
    expect(e.event_source_id).toBe("TT123");
    const ev = e.data[0];
    expect(ev.event).toBe("CompletePayment");
    expect(ev.event_id).toBe("evt-123");
    const u = ev.user as Record<string, string>;
    expect(u.phone).toMatch(HEX64);
    expect(u.email).toMatch(HEX64);
  });
});
