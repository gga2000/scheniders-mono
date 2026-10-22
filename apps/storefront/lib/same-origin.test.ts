import { describe, expect, it } from "vitest";
import { sameOriginTarget } from "./same-origin";

const ORIGIN = "http://localhost:3001";

describe("sameOriginTarget", () => {
  it("keeps same-origin paths with their query", () => {
    expect(sameOriginTarget("/s/shop/products/x?a=1", ORIGIN).href).toBe(
      "http://localhost:3001/s/shop/products/x?a=1",
    );
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "\t//evil.example",
    "https://evil.example/s/shop",
    "javascript:alert(1)",
  ])("never leaves the origin for %j", (to) => {
    expect(sameOriginTarget(to, ORIGIN).origin).toBe(ORIGIN);
  });

  it("falls back to the store home for missing or unparseable targets", () => {
    expect(sameOriginTarget(undefined, ORIGIN).href).toBe(`${ORIGIN}/`);
    expect(sameOriginTarget("http://[", ORIGIN).href).toBe(`${ORIGIN}/`);
  });
});
