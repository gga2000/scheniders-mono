import { describe, expect, it } from "vitest";
import {
  buildStorefrontUrl,
  DEFAULT_DEV_STOREFRONT_PORT,
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
