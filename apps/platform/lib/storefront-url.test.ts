import { describe, expect, it } from "vitest";
import {
  buildStorefrontUrl,
  DEFAULT_DEV_STOREFRONT_PORT,
  pickPrimaryDomain,
} from "./storefront-url";

describe("buildStorefrontUrl", () => {
  it("uses the configured local origin when the platform runs on localhost", () => {
    // The bug this replaces hardcoded :3001, so a storefront started on any
    // other port was invisible — the editor preview silently showed whatever
    // was listening on 3001 instead.
    expect(
      buildStorefrontUrl({
        slug: "scheniders-iraq",
        rootDomain: "localhost:3012",
        hostname: "localhost",
      }),
    ).toBe("http://localhost:3012/s/scheniders-iraq");
  });

  it("falls back to the conventional dev port when nothing local is configured", () => {
    // NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN defaults to the production domain,
    // which is unreachable from localhost.
    expect(
      buildStorefrontUrl({
        slug: "s",
        rootDomain: "scheniders.com",
        hostname: "localhost",
      }),
    ).toBe(`http://localhost:${DEFAULT_DEV_STOREFRONT_PORT}/s/s`);
  });

  it("prefers a verified custom domain in production", () => {
    expect(
      buildStorefrontUrl({
        slug: "s",
        customDomain: "shop.example.com",
        rootDomain: "scheniders.com",
        hostname: "app.scheniders.com",
      }),
    ).toBe("https://shop.example.com");
  });

  it("builds a subdomain from the root domain when there is no custom domain", () => {
    expect(
      buildStorefrontUrl({
        slug: "s",
        rootDomain: "scheniders.com",
        hostname: "app.scheniders.com",
      }),
    ).toBe("https://s.scheniders.com");
  });

  it("never sends a localhost preview to https", () => {
    // http, always: a local dev server has no certificate, and https here
    // fails the iframe with no visible error.
    const url = buildStorefrontUrl({
      slug: "s",
      customDomain: "shop.example.com",
      rootDomain: "localhost:3012",
      hostname: "localhost",
    });
    expect(url.startsWith("http://")).toBe(true);
  });
});

describe("pickPrimaryDomain", () => {
  it("prefers the real www domain over the bare one and the vercel.app host", () => {
    expect(
      pickPrimaryDomain([
        { domain: "scheniders-storefront.vercel.app", created_at: "2026-08-17" },
        { domain: "scheniders.com", created_at: "2026-09-05" },
        { domain: "www.scheniders.com", created_at: "2026-09-05" },
      ]),
    ).toBe("www.scheniders.com");
  });

  it("falls back to the vercel.app host when it is the only one", () => {
    expect(
      pickPrimaryDomain([{ domain: "shop.vercel.app", created_at: null }]),
    ).toBe("shop.vercel.app");
  });

  it("returns null with no verified domain", () => {
    expect(pickPrimaryDomain([])).toBeNull();
  });

  it("is stable: the oldest wins a tie", () => {
    expect(
      pickPrimaryDomain([
        { domain: "b.example.com", created_at: "2026-02-01" },
        { domain: "a.example.com", created_at: "2026-01-01" },
      ]),
    ).toBe("a.example.com");
  });
});
