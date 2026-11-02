import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ storePath: null as string | null }));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => (k === "x-store-path" ? state.storePath : null),
  }),
}));

vi.mock("next/navigation", () => ({
  permanentRedirect: (to: string) => {
    throw new Error(`308 ${to}`);
  },
  redirect: (to: string) => {
    throw new Error(`307 ${to}`);
  },
}));

import { enforceRedirect, withVisitorQuery } from "./redirects";

const config = {
  redirects: [{ from: "/products/perseviron", to: "/products/بيرسيفيرون" }],
} as unknown as Parameters<typeof enforceRedirect>[0];

describe("withVisitorQuery", () => {
  it("keeps the ad click id and utm tags", () => {
    expect(
      withVisitorQuery("/products/x", "/products/old?fbclid=AbC&utm_source=fb"),
    ).toBe("/products/x?fbclid=AbC&utm_source=fb");
  });

  it("leaves the target alone when there is no query", () => {
    expect(withVisitorQuery("/products/x", "/products/old")).toBe("/products/x");
    expect(withVisitorQuery("/products/x", null)).toBe("/products/x");
  });

  it("appends to a target that already has a query", () => {
    expect(withVisitorQuery("/products?sort=new", "/collections/all?fbclid=1")).toBe(
      "/products?sort=new&fbclid=1",
    );
  });

  it("never lets the header change the redirect host", () => {
    expect(withVisitorQuery("/products/x", "//evil.example/a?b=1")).toBe("/products/x?b=1");
  });
});

describe("enforceRedirect", () => {
  it("carries the visitor's query through a custom-domain redirect", async () => {
    state.storePath = "/products/perseviron?fbclid=AbC&utm_campaign=c1";
    await expect(
      enforceRedirect(config, "__domain__www.scheniders.com", "/products/perseviron"),
    ).rejects.toThrow(
      `308 ${encodeURI("/products/بيرسيفيرون")}?fbclid=AbC&utm_campaign=c1`,
    );
  });

  it("does nothing when no rule matches", async () => {
    state.storePath = "/products/none?fbclid=1";
    await expect(
      enforceRedirect(config, "__domain__www.scheniders.com", "/products/none"),
    ).resolves.toBeUndefined();
  });
});
