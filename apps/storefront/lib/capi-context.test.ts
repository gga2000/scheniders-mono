import { beforeEach, describe, expect, it, vi } from "vitest";
import { AD_ATTRIBUTION_COOKIE, serializeAdAttribution } from "@scheniders/shared/ad-attribution";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "user-agent": "UA", referer: "https://shop.test/p", "x-forwarded-for": "203.0.113.7" }),
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined) }),
}));

import { capiRequestContext } from "./capi-context";

describe("capiRequestContext", () => {
  beforeEach(() => jar.clear());

  it("reads the pixel cookies, IP, user agent and page", async () => {
    jar.set("_fbp", "fb.1.1.2");
    jar.set("_fbc", "fb.1.1.IwAR");
    jar.set("_ttp", "ttp1");
    const ctx = await capiRequestContext(1_700_000_000_000);
    expect(ctx).toMatchObject({
      ip: "203.0.113.7",
      userAgent: "UA",
      url: "https://shop.test/p",
      fbp: "fb.1.1.2",
      fbc: "fb.1.1.IwAR",
      ttp: "ttp1",
      ttclid: null,
    });
  });

  it("builds fbc from the recorded ad click when the pixel cookie is gone, and passes ttclid", async () => {
    jar.set(
      AD_ATTRIBUTION_COOKIE,
      serializeAdAttribution({ channel: "facebook", fbclid: "IwAR0abc", ttclid: "E.C.P.x" }),
    );
    const ctx = await capiRequestContext(1_700_000_000_000);
    expect(ctx.fbc).toBe("fb.1.1700000000000.IwAR0abc");
    expect(ctx.ttclid).toBe("E.C.P.x");
  });

  it("keeps the pixel's own _fbc over the recorded click", async () => {
    jar.set("_fbc", "fb.1.5.own");
    jar.set(AD_ATTRIBUTION_COOKIE, serializeAdAttribution({ channel: "facebook", fbclid: "other" }));
    expect((await capiRequestContext()).fbc).toBe("fb.1.5.own");
  });
});
