import { afterEach, describe, expect, it, vi } from "vitest";
import { extractSlug, storeKeyFromRequest } from "./store-host";

const ROOT = "scheniders.test";
const h = (init: Record<string, string>): Headers => new Headers(init);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("extractSlug", () => {
  it("reads a store subdomain", () => {
    expect(extractSlug("shop.scheniders.test", ROOT)).toEqual({ slug: "shop", isCustom: false });
  });

  it("ignores the port on both sides", () => {
    expect(extractSlug("shop.localhost:3001", "localhost:3001")).toEqual({ slug: "shop", isCustom: false });
  });

  it("treats the root domain and www as no store", () => {
    expect(extractSlug("scheniders.test", ROOT)).toEqual({ slug: null, isCustom: false });
    expect(extractSlug("www.scheniders.test", ROOT)).toEqual({ slug: null, isCustom: false });
  });

  it("treats any other host as a store's own domain", () => {
    expect(extractSlug("shop.example.com", ROOT)).toEqual({ slug: "shop.example.com", isCustom: true });
  });
});

describe("storeKeyFromRequest", () => {
  it("names a subdomain store by its slug", () => {
    expect(storeKeyFromRequest(h({ host: "shop.scheniders.test" }), ROOT)).toBe("shop");
  });

  it("names a custom-domain store the way the [tenant] route does", () => {
    expect(storeKeyFromRequest(h({ host: "shop.example.com" }), ROOT)).toBe("__domain__shop.example.com");
  });

  it("lets the host win over whatever the referer says", () => {
    expect(
      storeKeyFromRequest(
        h({ host: "shop.scheniders.test", referer: "https://scheniders.test/s/other/products/x" }),
        ROOT,
      ),
    ).toBe("shop");
  });

  it("reads a path-based store from a same-origin referer on the root domain", () => {
    expect(
      storeKeyFromRequest(
        h({ host: "scheniders.test", referer: "https://scheniders.test/s/shop/products/x" }),
        ROOT,
      ),
    ).toBe("shop");
  });

  it("refuses a referer from another origin", () => {
    expect(
      storeKeyFromRequest(h({ host: "scheniders.test", referer: "https://evil.example/s/shop/" }), ROOT),
    ).toBeNull();
  });

  it("names no store on the root domain without a referer", () => {
    expect(storeKeyFromRequest(h({ host: "scheniders.test" }), ROOT)).toBeNull();
  });

  it("does not treat the editor preview as a store page", () => {
    expect(
      storeKeyFromRequest(h({ host: "scheniders.test", referer: "https://scheniders.test/_preview/shop/home" }), ROOT),
    ).toBeNull();
  });

  it("names no store for an unparseable referer or a missing host", () => {
    expect(storeKeyFromRequest(h({ host: "scheniders.test", referer: "not a url" }), ROOT)).toBeNull();
    expect(storeKeyFromRequest(h({}), ROOT)).toBeNull();
  });

  it("defaults the root domain from the environment, like the proxy", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "scheniders.test");
    expect(storeKeyFromRequest(h({ host: "shop.scheniders.test" }))).toBe("shop");
  });
});
