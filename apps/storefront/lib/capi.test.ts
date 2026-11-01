import { createHash } from "crypto";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  buildMetaPurchaseEvent,
  buildTikTokPurchaseEvents,
  sendPurchaseCapi,
  tiktokPixelIds,
  type CapiPurchaseInput,
} from "./capi";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const TENANT = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a";

const base: CapiPurchaseInput = {
  analytics: {
    meta_pixel_id: "123456789012345",
    meta_capi_token: "tok",
    tiktok_pixel_id: "D6K0A2BC77U5VG9U2BRG, D4H7GIRC77U7MI8IFUJ0",
    tiktok_capi_token: "tok2",
  },
  tenantId: TENANT,
  eventId: "evt-123",
  customer: { phone: "0770 123 4567", name: "Ali Hassan Kareem", email: "A@B.com", governorate: "BGD" },
  value: 13000,
  contents: [
    { id: "a", quantity: 2, item_price: 5000 },
    { id: "b", quantity: 1, item_price: 3000 },
  ],
  context: {
    ip: "203.0.113.7",
    userAgent: "Mozilla/5.0 (iPhone)",
    url: "https://scheniders.example/products/x",
    fbp: "fb.1.1700000000000.123456789",
    fbc: "fb.1.1700000000000.IwAR0abc",
    ttp: "ttp-cookie-value",
  },
  eventTime: 1_700_000_000,
};

describe("buildMetaPurchaseEvent", () => {
  it("hashes PII in Meta's normal form and keeps event_id/value/contents", () => {
    const ev = buildMetaPurchaseEvent(base).data[0]!;
    expect(ev.event_name).toBe("Purchase");
    expect(ev.event_id).toBe("evt-123");
    const ud = ev.user_data as Record<string, string[] | string>;
    expect(ud.ph).toEqual([sha("9647701234567")]);
    expect(ud.external_id).toEqual([sha(`${TENANT}:9647701234567`)]);
    expect(ud.em).toEqual([sha("a@b.com")]);
    expect(ud.fn).toEqual([sha("ali")]);
    expect(ud.ln).toEqual([sha("kareem")]);
    expect(ud.ct).toEqual([sha("baghdad")]);
    expect(ud.country).toEqual([sha("iq")]);
    expect(JSON.stringify(ud)).not.toContain("7701234567");
    const cd = ev.custom_data as Record<string, unknown>;
    expect(cd.value).toBe(13000);
    expect(cd.currency).toBe("IQD");
    expect(cd.content_ids).toEqual(["a", "b"]);
    expect(cd.num_items).toBe(3);
  });

  it("carries the browser's ad cookies, IP, user agent and page, unhashed", () => {
    const ev = buildMetaPurchaseEvent(base).data[0]!;
    const ud = ev.user_data as Record<string, unknown>;
    expect(ud.fbp).toBe("fb.1.1700000000000.123456789");
    expect(ud.fbc).toBe("fb.1.1700000000000.IwAR0abc");
    expect(ud.client_ip_address).toBe("203.0.113.7");
    expect(ud.client_user_agent).toBe("Mozilla/5.0 (iPhone)");
    expect(ev.event_source_url).toBe("https://scheniders.example/products/x");
  });

  it("drops malformed cookies, an unknown IP, an unknown governorate and a bad phone", () => {
    const ev = buildMetaPurchaseEvent({
      ...base,
      customer: { phone: "123", governorate: "XX" },
      context: { ip: "unknown", fbp: "garbage", fbc: "" },
    }).data[0]!;
    const ud = ev.user_data as Record<string, unknown>;
    for (const k of ["ph", "external_id", "ct", "fbp", "fbc", "client_ip_address", "fn"]) {
      expect(ud[k], k).toBeUndefined();
    }
    expect(ev.event_source_url).toBeUndefined();
  });

  it("includes test_event_code when configured", () => {
    const e = buildMetaPurchaseEvent({
      ...base,
      analytics: { ...base.analytics, capi_test_event_code: "TEST1" },
    });
    expect(e.test_event_code).toBe("TEST1");
  });
});

describe("buildTikTokPurchaseEvents", () => {
  it("sends one body per configured pixel, phone hashed with the plus", () => {
    const bodies = buildTikTokPurchaseEvents(base);
    expect(bodies.map((b) => b.event_source_id)).toEqual(["D6K0A2BC77U5VG9U2BRG", "D4H7GIRC77U7MI8IFUJ0"]);
    const ev = bodies[0]!.data[0]!;
    expect(ev.event).toBe("CompletePayment");
    expect(ev.event_id).toBe("evt-123");
    const u = ev.user as Record<string, string>;
    expect(u.phone).toBe(sha("+9647701234567"));
    expect(u.external_id).toBe(sha(`${TENANT}:9647701234567`));
    expect(u.email).toBe(sha("a@b.com"));
    expect(u.ttp).toBe("ttp-cookie-value");
    expect(u.ip).toBe("203.0.113.7");
    expect(u.user_agent).toBe("Mozilla/5.0 (iPhone)");
    expect(ev.page).toEqual({ url: "https://scheniders.example/products/x" });
    expect((ev.properties as Record<string, unknown>).content_type).toBe("product_group");
  });

  it("parses the pixel list the way the browser loads it", () => {
    expect(tiktokPixelIds(" D6K0A2BC77U5VG9U2BRG,,bad ")).toEqual(["D6K0A2BC77U5VG9U2BRG"]);
    expect(tiktokPixelIds(undefined)).toEqual([]);
  });
});

describe("sendPurchaseCapi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts to Meta once and TikTok once per pixel, and logs a refusal instead of throwing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("bad token", { status: 400 }))
      .mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(sendPurchaseCapi(base)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("[capi] meta rejected: 400"));
  });

  it("sends nothing without tokens", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await sendPurchaseCapi({ ...base, analytics: { meta_pixel_id: "123456789012345", tiktok_pixel_id: "D6K0A2BC77U5VG9U2BRG" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
