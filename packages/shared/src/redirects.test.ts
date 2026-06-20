import { describe, it, expect } from "vitest";
import {
    matchRedirect,
    normalizeRedirectPath,
    validateRedirects,
} from "./redirects";
import type { RedirectRule } from "./types/store-config-v2";

describe("normalizeRedirectPath", () => {
    it("adds a leading slash, lowercases, strips trailing slash + query/hash", () => {
        expect(normalizeRedirectPath("products/Old-Slug/")).toBe(
            "/products/old-slug",
        );
        expect(normalizeRedirectPath("/Products/X?utm=1#frag")).toBe(
            "/products/x",
        );
        expect(normalizeRedirectPath("/")).toBe("/");
        expect(normalizeRedirectPath("")).toBe("/");
    });
});

describe("matchRedirect", () => {
    const rules: RedirectRule[] = [
        { from: "/products/old", to: "/products/new" },
        { from: "/sale", to: "/categories/sale", permanent: false },
        { from: "/go", to: "https://example.com/landing" },
    ];

    it("returns null when there are no rules", () => {
        expect(matchRedirect("/x", undefined)).toBeNull();
        expect(matchRedirect("/x", [])).toBeNull();
    });

    it("matches case-insensitively and trailing-slash-insensitively", () => {
        expect(matchRedirect("/Products/Old/", rules)).toEqual({
            to: "/products/new",
            permanent: true,
        });
    });

    it("defaults to permanent (308) and honors permanent:false (307)", () => {
        expect(matchRedirect("/products/old", rules)?.permanent).toBe(true);
        expect(matchRedirect("/sale", rules)?.permanent).toBe(false);
    });

    it("supports absolute-URL destinations", () => {
        expect(matchRedirect("/go", rules)?.to).toBe(
            "https://example.com/landing",
        );
    });

    it("ignores query/hash on the incoming path", () => {
        expect(matchRedirect("/products/old?ref=ig", rules)?.to).toBe(
            "/products/new",
        );
    });

    it("returns null when nothing matches", () => {
        expect(matchRedirect("/unknown", rules)).toBeNull();
    });

    it("skips a self-redirect to avoid loops", () => {
        expect(
            matchRedirect("/loop", [{ from: "/loop", to: "/loop/" }]),
        ).toBeNull();
    });

    it("skips malformed rules", () => {
        expect(
            matchRedirect("/x", [
                { from: "", to: "/y" },
                { from: "/x", to: "" },
            ] as RedirectRule[]),
        ).toBeNull();
    });
});

describe("validateRedirects", () => {
    it("flags empty fields", () => {
        const issues = validateRedirects([{ from: "/a", to: "" }]);
        expect(issues[0]).toMatch(/required/);
    });

    it("flags self-redirects", () => {
        const issues = validateRedirects([{ from: "/a", to: "/A/" }]);
        expect(issues[0]).toMatch(/same/);
    });

    it("flags duplicate sources", () => {
        const issues = validateRedirects([
            { from: "/a", to: "/b" },
            { from: "/A", to: "/c" },
        ]);
        expect(issues[1]).toMatch(/Duplicate/);
    });

    it("warns about a two-hop chain", () => {
        const issues = validateRedirects([
            { from: "/a", to: "/b" },
            { from: "/b", to: "/c" },
        ]);
        expect(issues[0]).toMatch(/two hops/);
    });

    it("returns no issues for a clean list", () => {
        expect(
            validateRedirects([
                { from: "/a", to: "/b" },
                { from: "/c", to: "/d" },
            ]),
        ).toEqual({});
    });
});
