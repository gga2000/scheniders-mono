// The skeletons exist to make a slow connection feel handled, not to invent
// content. These pin the two rules that keep them honest and themeable.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    PageHeadingSkeleton,
    ProductGridSkeleton,
    ProductPageSkeleton,
    SkeletonBlock,
} from "./skeletons";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("storefront skeletons", () => {
    it("renders the shape of a product grid, at the real column counts", () => {
        const out = html(<ProductGridSkeleton count={8} />);
        expect(out.match(/aspect-square/g)).toHaveLength(8);
        // Same breakpoints product_grid itself uses, so nothing jumps on swap.
        expect(out).toContain("grid-cols-2");
        expect(out).toContain("md:grid-cols-3");
        expect(out).toContain("lg:grid-cols-4");
    });

    it("mirrors the product page's one- and two-column split", () => {
        const out = html(<ProductPageSkeleton />);
        expect(out).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
    });

    it("says nothing — it is decorative and hidden from assistive tech", () => {
        for (const el of [<ProductGridSkeleton key="g" />, <ProductPageSkeleton key="p" />, <PageHeadingSkeleton key="h" />]) {
            const out = html(el);
            expect(out).toContain('aria-hidden="true"');
            // No copy at all: a localized "loading…" here could not read the
            // tenant's locale, so it would have to be hardcoded.
            expect(out.replace(/<[^>]+>/g, "").trim()).toBe("");
        }
    });

    it("paints only in brand-kit tokens, never a fixed colour", () => {
        const src = readFileSync(join(import.meta.dirname, "skeletons.tsx"), "utf8");
        expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(src).not.toMatch(/\b(?:bg|text|border)-(?:gray|zinc|slate|neutral|stone)-\d{2,3}\b/);
        expect(html(<SkeletonBlock className="h-4" />)).toContain("bg-bk-surface-alt");
    });

    it("the shimmer is defined once, and reduced motion is handled globally", () => {
        const css = readFileSync(
            join(import.meta.dirname, "..", "app", "globals.css"),
            "utf8",
        );
        expect(css).toContain(".bk-skeleton");
        expect(css).toContain("bk-skeleton-sweep");
        // The tenant-scope rules that flatten it live in the same stylesheet.
        expect(css).toContain('[data-bk-motion="reduce"]');
        expect(css).toContain("prefers-reduced-motion");
    });
});
