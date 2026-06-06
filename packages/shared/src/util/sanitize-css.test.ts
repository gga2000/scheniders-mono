import { describe, it, expect } from "vitest";
import { sanitizeCustomCss } from "./sanitize-css";

describe("sanitizeCustomCss", () => {
  it("neutralizes a <style> breakout (no closing-tag sequence survives)", () => {
    const out = sanitizeCustomCss("a{} </style><script>alert(1)</script>");
    expect(out).not.toMatch(/<\s*\//);            // no "</" closing-tag start
    expect(out.toLowerCase()).not.toContain("</style");
    expect(out.toLowerCase()).not.toContain("</script");
  });
  it("PRESERVES the CSS child combinator '>' ", () => {
    expect(sanitizeCustomCss(".nav > li { color: red }")).toContain("> li");
    expect(sanitizeCustomCss(".a>.b{}")).toContain(">");
  });
  it("removes javascript:, expression(), @import, behavior, -moz-binding", () => {
    const out = sanitizeCustomCss("x{background:url(javascript:alert(1))} y{width:expression(1)} @import 'http://e.v'; z{behavior:url(x)} w{-moz-binding:url(x)}");
    const lc = out.toLowerCase();
    expect(lc).not.toContain("javascript:");
    expect(lc).not.toContain("expression(");
    expect(lc).not.toContain("@import");
    expect(lc).not.toContain("behavior:");
    expect(lc).not.toContain("-moz-binding");
  });
  it("keeps safe declarations intact", () => {
    expect(sanitizeCustomCss(".btn{color:#0a0;border-radius:8px}")).toContain("border-radius:8px");
  });
  it("returns empty string for nullish input", () => {
    expect(sanitizeCustomCss(undefined)).toBe("");
    expect(sanitizeCustomCss(null)).toBe("");
    expect(sanitizeCustomCss("")).toBe("");
  });
});
