/**
 * The store hub's live preview adds `?sb_quiet=1` so the merchant's own
 * look at their store fires no pixels, funnel views or test exposures.
 * The proxy turns the flag into a request header and always sets it, so a
 * header the client sends never survives.
 */

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

function quietHeader(host: string, pathAndQuery: string, sent: Record<string, string> = {}): string | null {
  const req = new NextRequest(new URL(`https://${host}${pathAndQuery}`), {
    headers: { host, ...sent },
  });
  return proxy(req).headers.get("x-middleware-request-x-sb-quiet");
}

describe("x-sb-quiet", () => {
  it("is 1 when the hub preview asks for a quiet view", () => {
    expect(quietHeader("shop.localhost:3001", "/?sb_quiet=1")).toBe("1");
    expect(quietHeader("localhost:3001", "/s/shop?sb_quiet=1")).toBe("1");
  });

  it("is 0 for a normal shopper visit", () => {
    expect(quietHeader("shop.localhost:3001", "/products/a")).toBe("0");
  });

  it("overwrites a value the client sent", () => {
    expect(quietHeader("shop.localhost:3001", "/", { "x-sb-quiet": "1" })).toBe("0");
  });
});
