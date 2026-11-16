/**
 * Fermi A4: stores moved from `<slug>.scheniders.com` to `<slug>.usefermi.com`.
 * Shared links and ads on the old address must still land on the store, and
 * www.scheniders.com is the perfume store's own domain, never a store slug.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

async function proxyFor(root: string, legacy: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", root);
  vi.stubEnv("NEXT_PUBLIC_LEGACY_ROOT_DOMAINS", legacy);
  return (await import("../proxy")).proxy;
}

function request(host: string, pathAndQuery: string, method = "GET") {
  return new NextRequest(new URL(`https://${host}${pathAndQuery}`), { method, headers: { host } });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a store page on the old root", () => {
  it("308s to the same path and query on the new root", async () => {
    const proxy = await proxyFor("usefermi.com", "scheniders.com");
    const res = proxy(request("Acme.Scheniders.com", "/products/lipstick?utm_source=wa"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://acme.usefermi.com/products/lipstick?utm_source=wa");
  });

  it("moves the store's sitemap too", async () => {
    const proxy = await proxyFor("usefermi.com", "scheniders.com");
    expect(proxy(request("acme.scheniders.com", "/sitemap.xml")).headers.get("location")).toBe("https://acme.usefermi.com/sitemap.xml");
  });

  it("still serves a form post or an API call from a page opened before the move", async () => {
    const proxy = await proxyFor("usefermi.com", "scheniders.com");
    const post = proxy(request("acme.scheniders.com", "/checkout", "POST"));
    expect(post.headers.get("location")).toBeNull();
    expect(post.headers.get("x-middleware-rewrite")).toBe("https://acme.scheniders.com/s/acme/checkout");
    const api = proxy(request("acme.scheniders.com", "/api/cart/abandoned", "POST"));
    expect(api.headers.get("location")).toBeNull();
    expect(api.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("leaves www.scheniders.com to the store that verified it", async () => {
    const proxy = await proxyFor("usefermi.com", "scheniders.com");
    const res = proxy(request("www.scheniders.com", "/products/envoy"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://www.scheniders.com/s/__domain__www.scheniders.com/products/envoy");
  });

  it("serves a store on the new root as before", async () => {
    const proxy = await proxyFor("usefermi.com", "scheniders.com");
    const res = proxy(request("acme.usefermi.com", "/"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://acme.usefermi.com/s/acme");
  });

  it("refuses a nested host instead of guessing a store", async () => {
    const proxy = await proxyFor("usefermi.com", "scheniders.com");
    expect(proxy(request("a.b.scheniders.com", "/")).headers.get("location")).toBeNull();
  });

  it("moves nothing when no old root is set", async () => {
    const proxy = await proxyFor("usefermi.com", "");
    const res = proxy(request("acme.scheniders.com", "/"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://acme.scheniders.com/s/__domain__acme.scheniders.com");
  });
});
