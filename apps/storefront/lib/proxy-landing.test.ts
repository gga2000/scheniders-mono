/**
 * The root domain's home is Fermi's landing page (a static document in
 * public/landing), its www address moves to the bare root, /features serves
 * the full features page (public/features), and /pricing opens the landing
 * page's pricing section. Store hosts are untouched.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

async function proxyFor(root: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", root);
  return (await import("../proxy")).proxy;
}

function req(host: string, pathAndQuery: string, method = "GET") {
  return new NextRequest(new URL(`https://${host}${pathAndQuery}`), { headers: { host }, method });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Fermi landing page on the root domain", () => {
  it("serves the landing page at the root's home, keeping the query", async () => {
    const proxy = await proxyFor("usefermi.com");
    const res = proxy(req("usefermi.com", "/?utm_source=fb&pain=forget"));
    expect(res.headers.get("x-middleware-rewrite")).toBe(
      "https://usefermi.com/landing/index.html?utm_source=fb&pain=forget",
    );
  });

  it("serves it on a local root too", async () => {
    const proxy = await proxyFor("localhost:3001");
    const res = proxy(req("localhost:3001", "/"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://localhost:3001/landing/index.html");
  });

  it("serves the full features page at /features, keeping the query", async () => {
    const proxy = await proxyFor("usefermi.com");
    const res = proxy(req("usefermi.com", "/features?utm_source=ig&ref=abc"));
    expect(res.headers.get("x-middleware-rewrite")).toBe(
      "https://usefermi.com/features/index.html?utm_source=ig&ref=abc",
    );
  });

  it("leaves a store's own /features page on its subdomain alone", async () => {
    const proxy = await proxyFor("usefermi.com");
    const res = proxy(req("mithal.usefermi.com", "/features"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://mithal.usefermi.com/s/mithal/features");
  });

  it("sends /pricing to the page's pricing section", async () => {
    const proxy = await proxyFor("usefermi.com");
    const res = proxy(req("usefermi.com", "/pricing?ref=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://usefermi.com/?ref=abc#pricing");
  });

  it("308s www to the bare root with path and query", async () => {
    const proxy = await proxyFor("usefermi.com");
    const res = proxy(req("www.usefermi.com", "/pricing?utm_source=ig"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://usefermi.com/pricing?utm_source=ig");
  });

  it("leaves a store's home on its subdomain alone", async () => {
    const proxy = await proxyFor("usefermi.com");
    const res = proxy(req("mithal.usefermi.com", "/"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://mithal.usefermi.com/s/mithal");
  });

  it("does not treat the legacy root's www (a store's own domain) as the landing page", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEGACY_ROOT_DOMAINS", "scheniders.com");
    const proxy = await proxyFor("usefermi.com");
    const res = proxy(req("www.scheniders.com", "/"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://www.scheniders.com/s/__domain__www.scheniders.com");
  });
});
