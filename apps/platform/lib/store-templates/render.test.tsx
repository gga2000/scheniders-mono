// =====================================================================
// Store templates — rendered-output guards
// =====================================================================
// Renders every store template's home stack through the real section
// components and asserts on the markup that comes out.
//
// These exist because the bugs they catch are invisible to type-checking
// and to the unit tests: a section can be perfectly typed, render fine,
// and still paint a literal white card onto a near-black page. Each
// assertion below corresponds to a defect that actually shipped:
//
//   - `bg-white` / `candy-*` / `shadow-bento-*`: the Candy Bento palette
//     hardwired into sections, which made 2 of the 6 templates unusable.
//   - a filled `bg-bk-*` without its `text-bk-on-*` pair: how Kinetic
//     Ink's hero landed at 1.87:1 and Chrome Night's stat strip at 1:1.
//
// The full check (computed contrast in a browser at 390x844) needs a real
// engine and lives outside CI; this is the part that runs everywhere.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "@scheniders/sections/helpers/store-context";
import { BUILTIN_SECTIONS, type AnySectionDefinition } from "@scheniders/sections";
import type { PageId } from "@scheniders/shared";
import { STORE_TEMPLATES } from "./index";

const runtime = {
    page_id: "home" as const,
    breakpoint: "mobile" as const,
    locale: "ar" as const,
    audience_segments: [],
    ab_test_arms: {},
    now: new Date("2026-08-08T00:00:00Z"),
};

const products = Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    slug: `p${i}`,
    name: `منتج ${i + 1}`,
    price: 25000 + i * 15000,
    compare_at_price: i % 2 ? 60000 : null,
    images: [],
    image_url: null,
    in_stock: true,
    category_id: `c${i % 2}`,
    description: "وصف",
    sku: `SKU${i}`,
    variants: [],
}));

const categories = Array.from({ length: 3 }, (_, i) => ({
    id: `c${i}`,
    slug: `c${i}`,
    name: ["ملابس", "أحذية", "هدايا"][i],
    image_url: null,
    product_count: 4,
}));

function defOf(type: string): AnySectionDefinition | undefined {
    return (BUILTIN_SECTIONS as AnySectionDefinition[]).find((d) => d.type === type);
}

/** Every page a template actually seeds, as [templateId, pageId] pairs. */
const TEMPLATE_PAGES: Array<[string, PageId]> = STORE_TEMPLATES.flatMap((t) =>
    (Object.keys(t.pages) as PageId[])
        .filter((pageId) => (t.pages[pageId] ?? []).length > 0)
        .map((pageId) => [t.id, pageId] as [string, PageId]),
);

/** Render one template's stack for one page to a single markup string. */
function renderPage(templateId: string, pageId: PageId): string {
    const tpl = STORE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) throw new Error(`unknown template ${templateId}`);
    return (tpl.pages[pageId] ?? [])
        .map((section) => {
            const def = defOf(section.type);
            if (!def) throw new Error(`${templateId}: unknown section ${section.type}`);
            return renderToStaticMarkup(
                React.createElement(
                    StoreBaseProvider,
                    { base: "", children: null } as never,
                    React.createElement(def.render as never, {
                        props: def.defaultProps,
                        ctx: {
                            tenant: { name: "متجر نور" } as never,
                            runtime: { ...runtime, page_id: pageId },
                            // PDP sections read ctx.product; category and
                            // search read the collections. Supplying all of
                            // them keeps one ctx valid for every page.
                            product: products[0],
                            category: categories[0],
                            products,
                            categories,
                        },
                    } as never),
                ),
            );
        })
        .join("\n");
}

/**
 * Opaque fills and the foreground each one requires.
 *
 * `(?![-/])` excludes both the longer tokens (`bg-bk-ink-soft`) and the
 * alpha-modified ones (`bg-bk-accent/30`). A 30%-alpha accent is a tint
 * blended over the card beneath it, so ink stays the correct foreground
 * there — only opaque fills flip the text colour.
 */
const FILL_PAIRS: Array<{ bg: RegExp; needs: string[] }> = [
    { bg: /\bbg-bk-accent(?![-/\w])/, needs: ["text-bk-on-accent"] },
    { bg: /\bbg-bk-primary(?![-/\w])/, needs: ["text-bk-on-primary"] },
    { bg: /\bbg-bk-ink(?![-/\w])/, needs: ["text-bk-surface", "text-bk-on"] },
];

describe.each(TEMPLATE_PAGES)("%s / %s", (id, pageId) => {
    it("renders every section in the stack", () => {
        const html = renderPage(id, pageId);
        expect(html.length).toBeGreaterThan(0);
    });

    it("carries no hardcoded Candy Bento palette", () => {
        const html = renderPage(id, pageId);
        for (const banned of [
            /\bbg-white\b/,
            /\bcandy-(ink|cream|pink|mint|butter|lilac|sky)\b/,
            /\bshadow-bento(-sm|-lg)?\b/,
        ]) {
            expect(
                html.match(banned)?.[0],
                `${id}/${pageId} still emits ${banned}`,
            ).toBeUndefined();
        }
    });

    it("pairs every filled background with its on-color", () => {
        const html = renderPage(id, pageId);
        const classAttrs = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
        const unpaired = classAttrs.filter((cls) =>
            FILL_PAIRS.some(
                ({ bg, needs }) => bg.test(cls) && !needs.some((n) => cls.includes(n)),
            ),
        );
        expect(
            unpaired,
            `${id}/${pageId} has filled surfaces with no foreground`,
        ).toEqual([]);
    });
});
