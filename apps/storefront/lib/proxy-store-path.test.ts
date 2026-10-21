/**
 * The proxy forwards the visitor's original path and query as `x-store-path`.
 *
 * A renamed store's old link 308s to its new slug (route-guards
 * requireStoreTenant). The route segment only sees the `[tenant]` param, so
 * without the original URL the redirect could only land on the store home,
 * and a shared product link would lose its product.
 */

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

/** The `x-store-path` the proxy hands the route, or null if it set none. */
function forwardedStorePath(
  host: string,
  pathAndQuery: string,
  sent: Record<string, string> = {},
): string | null {
  const req = new NextRequest(new URL(`https://${host}${pathAndQuery}`), {
    headers: { host, ...sent },
  });
  return proxy(req).headers.get("x-middleware-request-x-store-path");
}

describe("x-store-path", () => {
  it("carries the full path and query in path mode", () => {
    expect(
      forwardedStorePath("localhost:3001", "/s/old-shop/products/lipstick?utm_source=wa"),
    ).toBe("/s/old-shop/products/lipstick?utm_source=wa");
  });

  it("carries the pre-rewrite path and query in subdomain mode", () => {
    expect(forwardedStorePath("old.localhost:3001", "/products/lipstick?utm_source=wa")).toBe(
      "/products/lipstick?utm_source=wa",
    );
  });

  it("overwrites a value the client sent", () => {
    expect(
      forwardedStorePath("old.localhost:3001", "/products/a", {
        "x-store-path": "//evil.example/x",
      }),
    ).toBe("/products/a");
  });
});
