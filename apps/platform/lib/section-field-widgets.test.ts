import { describe, expect, it } from "vitest";
import { resolveFieldWidget, classifyHref, buildHref } from "./section-field-widgets";

describe("resolveFieldWidget", () => {
    it("routes the reference fields that actually exist in sections", () => {
        expect(resolveFieldWidget("product_id")).toEqual({ kind: "product", multiple: false });
        expect(resolveFieldWidget("pinned_product_ids")).toEqual({ kind: "product", multiple: true });
        expect(resolveFieldWidget("manual_product_ids")).toEqual({ kind: "product", multiple: true });
        expect(resolveFieldWidget("manual_category_ids")).toEqual({ kind: "category", multiple: true, stores: "id" });
        expect(resolveFieldWidget("category_slug")).toEqual({ kind: "category", multiple: false, stores: "slug" });
    });

    it("routes every href field to the link picker", () => {
        for (const key of ["cta_href", "link_href", "primary_href", "see_all_href", "href"]) {
            expect(resolveFieldWidget(key), key).toEqual({ kind: "link" });
        }
    });

    it("routes attribute references to the attribute picker", () => {
        expect(resolveFieldWidget("attribute_key")).toEqual({ kind: "attribute", multiple: false });
        expect(resolveFieldWidget("attribute_keys")).toEqual({ kind: "attribute", multiple: true });
    });

    it("leaves ordinary fields alone", () => {
        for (const key of ["title_i18n", "limit", "image_url", "tone", "id", "video_url"]) {
            expect(resolveFieldWidget(key), key).toBeNull();
        }
    });
});

describe("classifyHref", () => {
    it("recognises the storefront's own routes", () => {
        expect(classifyHref("/products")).toEqual({ kind: "page", value: "/products" });
        expect(classifyHref("/categories/work")).toEqual({ kind: "category", value: "work" });
        expect(classifyHref("/products/fusion")).toEqual({ kind: "product", value: "fusion" });
        expect(classifyHref("/p/fusion")).toEqual({ kind: "product", value: "fusion" });
    });

    it("decodes a percent-encoded Arabic slug", () => {
        // Arabic slugs are real here — /products/ويفر arrives encoded.
        expect(classifyHref("/products/%D9%88%D9%8A%D9%81%D8%B1")).toEqual({
            kind: "product",
            value: "ويفر",
        });
    });

    it("recognises external and messaging destinations", () => {
        for (const raw of ["https://example.com", "//cdn.example.com/x", "mailto:a@b.c", "tel:+9647700000000"]) {
            expect(classifyHref(raw).kind, raw).toBe("external");
        }
    });

    it("treats a bare word as external rather than silently rewriting it", () => {
        expect(classifyHref("shop")).toEqual({ kind: "external", value: "shop" });
    });

    it("treats an empty or missing href as an unset page link", () => {
        expect(classifyHref(undefined)).toEqual({ kind: "page", value: "" });
        expect(classifyHref("   ")).toEqual({ kind: "page", value: "" });
    });

    it("ignores a query string when identifying the target", () => {
        expect(classifyHref("/categories/work?sort=new")).toEqual({ kind: "category", value: "work" });
    });
});

describe("buildHref", () => {
    it("round-trips every kind through classifyHref", () => {
        const cases: [Parameters<typeof buildHref>[0], string][] = [
            ["page", "/about"],
            ["category", "work"],
            ["product", "fusion"],
            ["external", "https://example.com"],
        ];
        for (const [kind, value] of cases) {
            const href = buildHref(kind, value);
            expect(classifyHref(href), `${kind}:${value}`).toEqual({ kind, value });
        }
    });

    it("returns empty for an empty choice rather than a dangling prefix", () => {
        expect(buildHref("category", "")).toBe("");
        expect(buildHref("product", "  ")).toBe("");
    });
});
