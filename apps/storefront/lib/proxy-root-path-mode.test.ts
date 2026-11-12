/**
 * On the real root domain, /s/<slug> pages would put every store on one
 * origin (one localStorage, one sessionStorage, one cookie jar), so one
 * merchant's tracking script could read another store's shoppers. The proxy
 * sends those links to the store's own subdomain instead.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

async function proxyFor(root: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", root);
  return (await import("../proxy")).proxy;
}

function get(host: string, pathAndQuery: string) {
  return new NextRequest(new URL(`https://${host}${pathAndQuery}`), { headers: { host } });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("path-mode store links on the root domain", () => {
  it("308s to the store's own subdomain, keeping path and query", async () => {
    const proxy = await proxyFor("scheniders.com");
    const res = proxy(get("scheniders.com", "/s/acme/products/lipstick?utm_source=wa"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://acme.scheniders.com/products/lipstick?utm_source=wa");
  });

  it("sends the bare store link to the store home", async () => {
    const proxy = await proxyFor("scheniders.com");
    expect(proxy(get("scheniders.com", "/s/acme")).headers.get("location")).toBe("https://acme.scheniders.com/");
  });

  it("refuses a slug that is not a hostname label", async () => {
    const proxy = await proxyFor("scheniders.com");
    expect(proxy(get("scheniders.com", "/s/-bad_slug-/x")).status).toBe(404);
  });

  it("keeps path mode on a local root, which has no subdomains", async () => {
    const proxy = await proxyFor("localhost:3001");
    const res = proxy(get("localhost:3001", "/s/acme/products/lipstick"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-store-base")).toBe("/s/acme");
  });
});
