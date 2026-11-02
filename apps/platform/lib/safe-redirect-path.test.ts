import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect-path";

describe("safeRedirectPath", () => {
    it("keeps same-site absolute paths, query and hash", () => {
        expect(safeRedirectPath("/orders")).toBe("/orders");
        expect(safeRedirectPath("/oauth/consent?authorization_id=abc")).toBe("/oauth/consent?authorization_id=abc");
        expect(safeRedirectPath("/a#b")).toBe("/a#b");
    });

    it.each([
        "https://evil.com",
        "http://evil.com/x",
        "//evil.com",
        "/\\evil.com",
        "\\\\evil.com",
        "@evil.com",
        ".evil.com",
        "orders",
        "javascript:alert(1)",
        "/\t/evil.com",
        "/\n/evil.com",
        "",
    ])("rejects %j", (value) => {
        expect(safeRedirectPath(value)).toBe("/orders");
    });

    it("falls back for null, undefined and a custom fallback", () => {
        expect(safeRedirectPath(null)).toBe("/orders");
        expect(safeRedirectPath(undefined)).toBe("/orders");
        expect(safeRedirectPath("//x", "/home")).toBe("/home");
    });
});
