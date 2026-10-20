import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveFieldWidget, classifyHref, buildHref, isLinkPagePath, LINK_PAGES } from "./section-field-widgets";

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
    });

    it("reads /p/<slug> as a custom page, which is what the storefront serves there", () => {
        // apps/storefront/app/s/[tenant]/p/[slug] is the custom-page route;
        // products live under /products/<slug> only.
        expect(classifyHref("/p/eid-sale")).toEqual({ kind: "custom_page", value: "eid-sale" });
        expect(classifyHref("/p/%D8%B9%D9%8A%D8%AF")).toEqual({ kind: "custom_page", value: "عيد" });
    });

    it("keeps a store path the page list does not name as a page link, unchanged", () => {
        expect(classifyHref("/products?sort=sale")).toEqual({ kind: "page", value: "/products?sort=sale" });
        expect(isLinkPagePath("/products?sort=sale")).toBe(false);
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
            ["custom_page", "eid-sale"],
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

describe("LINK_PAGES", () => {
    it("lists search, which live section links already point at", () => {
        expect(isLinkPagePath("/search")).toBe(true);
    });

    it("lists only routes the storefront serves", () => {
        const tenantRoutes = path.resolve(__dirname, "../../storefront/app/s/[tenant]");
        for (const p of LINK_PAGES) {
            expect(fs.existsSync(path.join(tenantRoutes, p.path, "page.tsx")), p.path).toBe(true);
        }
        expect(new Set(LINK_PAGES.map((p) => p.path)).size).toBe(LINK_PAGES.length);
    });
});
